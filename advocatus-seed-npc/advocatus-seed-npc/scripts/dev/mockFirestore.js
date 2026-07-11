'use strict';

/**
 * Mock minimalista de Firestore — só o suficiente para exercitar o seed,
 * a reposição de ciclo de vida, a expansão institucional e o pipeline de
 * resolução idempotente localmente, sem precisar de credenciais reais.
 * Não é para produção.
 */

class MockIncrement {
  constructor(n) { this.n = n; }
}

const FieldValue = {
  increment: (n) => new MockIncrement(n),
};

function aplicarSentinelas(base, patch, isSet) {
  const resultado = isSet ? {} : JSON.parse(JSON.stringify(base || {}));
  for (const [chave, valor] of Object.entries(patch)) {
    if (chave.includes('.')) {
      const [a, b] = chave.split('.');
      resultado[a] = resultado[a] || {};
      resultado[a][b] = valor instanceof MockIncrement
        ? (resultado[a][b] || 0) + valor.n
        : valor;
    } else if (valor instanceof MockIncrement) {
      resultado[chave] = (resultado[chave] || 0) + valor.n;
    } else {
      resultado[chave] = valor;
    }
  }
  return resultado;
}

class MockDocRef {
  constructor(store, path) {
    this.store = store;
    this.path = path;
    this.id = path.split('/').pop();
  }

  async get() {
    const data = this.store.get(this.path);
    return {
      exists: data !== undefined,
      id: this.id,
      data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined),
      ref: this,
    };
  }

  async set(data) {
    this.store.set(this.path, aplicarSentinelas(this.store.get(this.path), data, true));
  }

  async update(partial) {
    const atual = this.store.get(this.path) || {};
    const atualizado = aplicarSentinelas(atual, partial, false);
    // console.log(`[MockUpdate] path=${this.path}`, partial, '=>', atualizado);
    this.store.set(this.path, atualizado);
  }

  collection(name) {
    return new MockCollectionRef(this.store, `${this.path}/${name}`);
  }

  get parent() {
    // Coleção que contém este documento: remove o último segmento (docId).
    const segs = this.path.split('/');
    segs.pop();
    return new MockCollectionRef(this.store, segs.join('/'));
  }
}

class MockCollectionRef {
  constructor(store, path) {
    this.store = store;
    this.path = path;
    this._filters = [];
    this._limit = null;
  }

  doc(id) {
    const docId = id || `auto_${Math.random().toString(36).slice(2, 10)}`;
    return new MockDocRef(this.store, `${this.path}/${docId}`);
  }

  get parent() {
    // Documento pai desta subcoleção: remove o último segmento (nome da
    // coleção). Retorna null se for uma coleção de topo.
    const segs = this.path.split('/');
    segs.pop();
    if (segs.length === 0) return null;
    return new MockDocRef(this.store, segs.join('/'));
  }

  where(field, op, value) {
    const nova = new MockCollectionRef(this.store, this.path);
    nova._filters = [...this._filters, { field, op, value }];
    nova._limit = this._limit;
    return nova;
  }

  limit(n) {
    const nova = new MockCollectionRef(this.store, this.path);
    nova._filters = this._filters;
    nova._limit = n;
    return nova;
  }

  async get() {
    const prefixo = `${this.path}/`;
    let docs = [];
    for (const [path, data] of this.store.entries()) {
      if (!path.startsWith(prefixo)) continue;
      const resto = path.slice(prefixo.length);
      if (resto.includes('/')) continue; // só documentos diretos desta coleção
      if (this._filters.every((f) => aplicaFiltro(data, f))) {
        docs.push({
          id: resto,
          data: () => JSON.parse(JSON.stringify(data)),
          ref: new MockDocRef(this.store, path),
        });
      }
    }
    if (this._limit) docs = docs.slice(0, this._limit);
    return { empty: docs.length === 0, docs, size: docs.length };
  }
}

function getCampo(obj, caminho) {
  return caminho.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), obj);
}

function aplicaFiltro(data, filtro) {
  const valor = getCampo(data, filtro.field);
  switch (filtro.op) {
    case '==': return valor === filtro.value;
    case '>': return valor > filtro.value;
    case '>=': return valor >= filtro.value;
    case '<': return valor < filtro.value;
    case 'in': return Array.isArray(filtro.value) && filtro.value.includes(valor);
    default: throw new Error(`Operador de filtro não suportado no mock: ${filtro.op}`);
  }
}

class MockCollectionGroupRef {
  constructor(store, name) {
    this.store = store;
    this.name = name;
    this._filters = [];
    this._limit = null;
  }
  where(field, op, value) {
    const nova = new MockCollectionGroupRef(this.store, this.name);
    nova._filters = [...this._filters, { field, op, value }];
    nova._limit = this._limit;
    return nova;
  }
  limit(n) {
    const nova = new MockCollectionGroupRef(this.store, this.name);
    nova._filters = this._filters;
    nova._limit = n;
    return nova;
  }
  async get() {
    // Um doc pertence à collection group `name` se o penúltimo segmento do
    // path for exatamente `name` (…/{name}/{docId}).
    let docs = [];
    for (const [path, data] of this.store.entries()) {
      const segs = path.split('/');
      if (segs.length < 2 || segs[segs.length - 2] !== this.name) continue;
      if (this._filters.every((f) => aplicaFiltro(data, f))) {
        docs.push({ id: segs[segs.length - 1], data: () => JSON.parse(JSON.stringify(data)), ref: new MockDocRef(this.store, path) });
      }
    }
    if (this._limit) docs = docs.slice(0, this._limit);
    return { empty: docs.length === 0, docs, size: docs.length };
  }
}

class MockFirestore {
  constructor() {
    this.store = new Map();
    this._filaTransacoes = Promise.resolve();
    
    // Proxy for backward compatibility with tests using db._dados['collection']
    this._dados = new Proxy({}, {
      get: (target, prop) => {
        const result = {};
        for (const [key, value] of this.store.entries()) {
          if (key.startsWith(prop + '/')) {
            const docId = key.split('/')[1];
            result[docId] = value;
          }
        }
        // Return a proxy to intercept assignments like db._dados['peticoes'][id] = ...
        return new Proxy(result, {
          set: (obj, docId, value) => {
            this.store.set(`${prop}/${docId}`, value);
            return true;
          },
          deleteProperty: (obj, docId) => {
            this.store.delete(`${prop}/${docId}`);
            return true;
          }
        });
      },
      set: (target, prop, value) => {
        // Handle db._dados['collection'] = { doc1: {...}, doc2: {...} }
        for (const [docId, docData] of Object.entries(value || {})) {
          this.store.set(`${prop}/${docId}`, docData);
        }
        return true;
      }
    });
  }

  collection(name) {
    return new MockCollectionRef(this.store, name);
  }

  collectionGroup(name) {
    return new MockCollectionGroupRef(this.store, name);
  }

  /**
   * Real Firestore serializa transactions via controle otimista de
   * concorrência: se o read set de uma transaction for alterado antes do
   * commit, ela é abortada e reexecutada automaticamente. Este mock não
   * implementa esse retry — em vez disso, serializa runTransaction() por
   * uma fila (mutex), o que produz o MESMO resultado final para o padrão
   * "ler → decidir → escrever" usado neste projeto (locks, slots de seed,
   * reserva de vaga): a segunda chamada só começa a ler depois que a
   * primeira já terminou de escrever. Isso é mais forte que necessário em
   * alguns casos (Firestore permite transactions verdadeiramente paralelas
   * em documentos diferentes), mas é suficiente e honesto para provar que
   * os locks e slots deste projeto não têm race condition — não prova
   * performance sob concorrência real, só corretude do resultado final.
   */
  async runTransaction(fn) {
    const minhaVez = this._filaTransacoes.then(() => {
      const tx = {
        get: async (ref) => ref.get(),
        update: (ref, partial) => ref.update(partial),
        set: (ref, data) => ref.set(data),
      };
      return fn(tx);
    });
    this._filaTransacoes = minhaVez.catch(() => {}); // não trava a fila se uma transaction falhar
    return minhaVez;
  }
}

module.exports = { MockFirestore, FieldValue };
