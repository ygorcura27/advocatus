/**
 * Testes das regras do Firestore — anti-trapaça (F12).
 * Rodar (na pasta tests/regras, com Java instalado):  npm install && npm test
 *
 * Cada bloco tem os dois lados: o que o jogo faz de verdade pelo navegador
 * (tem que continuar passando) e a trapaça equivalente (tem que falhar).
 */
import test, { before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, addDoc, collection, increment } from 'firebase/firestore';

let env;
const UID = 'jogador1';

const fichaBase = () => ({
  uid: UID, nome_personagem: 'Teste', criado_em: '2026-01-01',
  cargo_id: 'est', oab: false, xp: 0, wins: 0, losses: 0, wins_ano: 0, losses_ano: 0,
  anos_carreira: 0, reputacao: 10, dinheiro: 5000, mes_pessoal: 3, ano_pessoal: 1,
  mes_global_pessoal: 4, idade: 22, pat: { moradia: 'pais', transporte: 'onibus', escritorio: 'home' },
  moradias_compradas: {}, carros_comprados: {}, financiamentos: {}, compras: [],
  skills: { oratoria: 10 }, energia_usada_mes: 0,
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-advocatus',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 },
  });
});
after(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

/** Grava estado inicial sem passar pelas regras (como o servidor faria). */
async function semRegras(fn) {
  await env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));
}
const eu = () => env.authenticatedContext(UID).firestore();
const jogadorRef = (db, uid = UID) => doc(db, 'jogadores', uid);

// ══════════════════════════════════════════════════════════════
// CRIAÇÃO DE PERSONAGEM (index.html)
// ══════════════════════════════════════════════════════════════
test('criar personagem novo (index.html) passa', async () => {
  await assertSucceeds(setDoc(jogadorRef(eu()), fichaBase()));
});
test('criar personagem já rico/promovido falha', async () => {
  await assertFails(setDoc(jogadorRef(eu()), { ...fichaBase(), dinheiro: 1e9 }));
  await assertFails(setDoc(jogadorRef(eu()), { ...fichaBase(), xp: 5000 }));
  await assertFails(setDoc(jogadorRef(eu()), { ...fichaBase(), cargo_id: 'snm' }));
  await assertFails(setDoc(jogadorRef(eu()), { ...fichaBase(), oab: true }));
});

// ══════════════════════════════════════════════════════════════
// FICHA DO JOGADOR
// ══════════════════════════════════════════════════════════════
test('gastar dinheiro/energia (compra, estudo) passa', async () => {
  await semRegras((db) => setDoc(jogadorRef(db), fichaBase()));
  await assertSucceeds(updateDoc(jogadorRef(eu()), { dinheiro: 4500, energia_usada_mes: 5, study_queue: [] }));
});
test('alugar moradia / trocar transporte pra ônibus passa', async () => {
  await semRegras((db) => setDoc(jogadorRef(db), fichaBase()));
  await assertSucceeds(updateDoc(jogadorRef(eu()), { 'pat.moradia': 'catete', reputacao: 17 }));
});
test('aumentar o próprio dinheiro pelo F12 falha', async () => {
  await semRegras((db) => setDoc(jogadorRef(db), fichaBase()));
  await assertFails(updateDoc(jogadorRef(eu()), { dinheiro: 999999999 }));
  await assertFails(updateDoc(jogadorRef(eu()), { dinheiro: increment(1) }));
});
test('XP, vitórias, anos de carreira: não sobem pelo navegador', async () => {
  await semRegras((db) => setDoc(jogadorRef(db), fichaBase()));
  await assertFails(updateDoc(jogadorRef(eu()), { xp: 4500 }));
  await assertFails(updateDoc(jogadorRef(eu()), { wins: 100 }));
  await assertFails(updateDoc(jogadorRef(eu()), { anos_carreira: 20 }));
});
test('apagar derrotas falha', async () => {
  await semRegras((db) => setDoc(jogadorRef(db), { ...fichaBase(), losses: 7 }));
  await assertFails(updateDoc(jogadorRef(eu()), { losses: 0 }));
});
test('marcar OAB aprovada pelo navegador falha', async () => {
  await semRegras((db) => setDoc(jogadorRef(db), fichaBase()));
  await assertFails(updateDoc(jogadorRef(eu()), { oab: true }));
});
test('promoção com XP suficiente passa (js/carreira.js:promover)', async () => {
  await semRegras((db) => setDoc(jogadorRef(db), { ...fichaBase(), xp: 130 }));
  await assertSucceeds(updateDoc(jogadorRef(eu()), { cargo_id: 'ass', reputacao: 10, ultima_promocao_mes_total: 15 }));
});
test('promoção sem XP / sem OAB / cargo público falha', async () => {
  await semRegras((db) => setDoc(jogadorRef(db), { ...fichaBase(), xp: 130 }));
  await assertFails(updateDoc(jogadorRef(eu()), { cargo_id: 'snm' }));
  await assertFails(updateDoc(jogadorRef(eu()), { cargo_id: 'jnr' }));   // xp ok? não (260) e sem OAB
  await assertFails(updateDoc(jogadorRef(eu()), { cargo_id: 'jsub' }));  // juiz
});
test('Júnior exige OAB mesmo com XP', async () => {
  await semRegras((db) => setDoc(jogadorRef(db), { ...fichaBase(), cargo_id: 'ass', xp: 300 }));
  await assertFails(updateDoc(jogadorRef(eu()), { cargo_id: 'jnr' }));
  await semRegras((db) => updateDoc(jogadorRef(db), { oab: true }));
  await assertSucceeds(updateDoc(jogadorRef(eu()), { cargo_id: 'jnr' }));
});
test('aceitar vaga: cargo compatível + salário no teto passa (js/vagas.js)', async () => {
  await semRegras((db) => setDoc(jogadorRef(db), { ...fichaBase(), cargo_id: 'jnr', xp: 300, oab: true }));
  await assertSucceeds(updateDoc(jogadorRef(eu()), {
    escritorio_id: 'npc_x', escritorio_empregado_id: 'npc_x', cargo_id: 'jnr',
    sal_base_escritorio: 15000, derrotas_consecutivas: 0,
  }));
});
test('salário inventado falha', async () => {
  await semRegras((db) => setDoc(jogadorRef(db), { ...fichaBase(), cargo_id: 'jnr', xp: 300, oab: true, escritorio_empregado_id: 'npc_x', sal_base_escritorio: 5000 }));
  await assertFails(updateDoc(jogadorRef(eu()), { sal_base_escritorio: 900000 }));                                        // sem trocar de emprego
  await assertFails(updateDoc(jogadorRef(eu()), { escritorio_empregado_id: 'npc_y', sal_base_escritorio: 900000 }));      // acima do teto
  await assertSucceeds(updateDoc(jogadorRef(eu()), { escritorio_empregado_id: null, sal_base_escritorio: 0 }));           // sair do emprego
});
test('posse, investimento, crédito, calendário e personagem ativo: travados', async () => {
  await semRegras((db) => setDoc(jogadorRef(db), fichaBase()));
  await assertFails(updateDoc(jogadorRef(eu()), { 'moradias_compradas.leblon': true }));
  await assertFails(updateDoc(jogadorRef(eu()), { 'carros_comprados.esp_ital': true }));
  await assertFails(updateDoc(jogadorRef(eu()), { compras: [{ id: 'relogio_lux' }] }));
  await assertFails(updateDoc(jogadorRef(eu()), { 'financiamentos.suv': { parcelas_restantes: 0 } }));
  await assertFails(updateDoc(jogadorRef(eu()), { investimentos: { renda_fixa: [{ valor_aplicado: 1e9 }] } }));
  await assertFails(updateDoc(jogadorRef(eu()), { linha_credito: { saldo: 0, teto: 1e9 } }));
  await assertFails(updateDoc(jogadorRef(eu()), { mes_global_pessoal: 999 }));
  await assertFails(updateDoc(jogadorRef(eu()), { personagem_ativo_id: 'outro' }));
});
test('outro jogador não mexe na minha ficha', async () => {
  await semRegras((db) => setDoc(jogadorRef(db), fichaBase()));
  const outro = env.authenticatedContext('outro').firestore();
  await assertFails(updateDoc(jogadorRef(outro), { dinheiro: 1 }));
});

// ══════════════════════════════════════════════════════════════
// PERSONAGENS ARQUIVADOS
// ══════════════════════════════════════════════════════════════
test('criar ficha de personagem pelo navegador falha', async () => {
  await semRegras((db) => setDoc(jogadorRef(db), fichaBase()));
  await assertFails(setDoc(doc(eu(), 'jogadores', UID, 'personagens', 'fake'), { ...fichaBase(), dinheiro: 1e9 }));
});
test('ficha arquivada: aceitar convite passa, inflar saldo falha', async () => {
  await semRegras(async (db) => {
    await setDoc(jogadorRef(db), fichaBase());
    await setDoc(doc(db, 'jogadores', UID, 'personagens', 'p2'), { ...fichaBase(), cargo_id: 'jnr', xp: 300, oab: true });
  });
  const ref = doc(eu(), 'jogadores', UID, 'personagens', 'p2');
  await assertSucceeds(updateDoc(ref, { escritorio_empregado_id: 'esc1', cargo_id: 'jnr', sal_base_escritorio: 4000 }));
  await assertFails(updateDoc(ref, { dinheiro: 1e9 }));
});
test('filhos/relacionamentos de personagem arquivado continuam editáveis', async () => {
  await semRegras((db) => setDoc(doc(db, 'jogadores', UID, 'personagens', 'p2'), fichaBase()));
  await assertSucceeds(setDoc(doc(eu(), 'jogadores', UID, 'personagens', 'p2', 'relacionamentos', 'r1'), { afinidade: 10 }));
});

// ══════════════════════════════════════════════════════════════
// ESCRITÓRIO
// ══════════════════════════════════════════════════════════════
const escBase = () => ({ dono_uid: UID, fundador_uid: UID, nome: 'Esc', caixa: 10000, socios_uids: [UID] });
test('criar escritório com caixa zerado passa; com caixa cheio falha', async () => {
  await assertSucceeds(setDoc(doc(eu(), 'escritorios', 'e1'), { ...escBase(), caixa: 0 }));
  await assertFails(setDoc(doc(eu(), 'escritorios', 'e2'), { ...escBase(), caixa: 1e9 }));
});
test('dono paga do caixa (desce) passa; aumentar o caixa falha', async () => {
  await semRegras((db) => setDoc(doc(db, 'escritorios', 'e1'), escBase()));
  await assertSucceeds(updateDoc(doc(eu(), 'escritorios', 'e1'), { caixa: 9000 }));
  await assertFails(updateDoc(doc(eu(), 'escritorios', 'e1'), { caixa: 1e9 }));
  await assertFails(updateDoc(doc(eu(), 'escritorios', 'e1'), { caixa: increment(5000) }));
});
test('oportunidade: recusar passa; criar/editar valor/marcar aceita falha', async () => {
  await semRegras(async (db) => {
    await setDoc(doc(db, 'escritorios', 'e1'), escBase());
    await setDoc(doc(db, 'escritorios', 'e1', 'oportunidades', 'o1'), { valor: 5000, status: 'disponivel' });
    await setDoc(doc(db, 'escritorios', 'e1', 'oportunidades', 'o2'), { valor: 5000, status: 'disponivel' });
  });
  await assertSucceeds(updateDoc(doc(eu(), 'escritorios', 'e1', 'oportunidades', 'o1'), { status: 'recusado' }));
  await assertFails(updateDoc(doc(eu(), 'escritorios', 'e1', 'oportunidades', 'o2'), { valor: 1e9 }));
  await assertFails(updateDoc(doc(eu(), 'escritorios', 'e1', 'oportunidades', 'o2'), { status: 'aceita' }));
  await assertFails(addDoc(collection(eu(), 'escritorios', 'e1', 'oportunidades'), { valor: 1e9, status: 'disponivel' }));
});
test('pool: gerar caso com honorário normal passa; inflado ou mexido depois falha', async () => {
  await semRegras((db) => setDoc(doc(db, 'escritorios', 'e1'), escBase()));
  const pool = collection(eu(), 'escritorios', 'e1', 'processos_pool');
  const ref = await assertSucceeds(addDoc(pool, { titulo: 'x', honorarios: 38000, status: 'disponivel', progresso: 0, resultado: null }));
  await assertFails(addDoc(pool, { titulo: 'y', honorarios: 5e6, status: 'disponivel' }));
  await assertSucceeds(updateDoc(ref, { status: 'em_andamento', assumido_uid: UID, progresso: 0, processo_ref: 'p1' }));
  await assertFails(updateDoc(ref, { honorarios: 5e6 }));
  await assertFails(updateDoc(ref, { sentenca_pendente: { resultado: 'procedente', valorRecebido: 1e9 } }));
  await assertFails(updateDoc(ref, { status: 'concluido', valor_recebido: 1e9 }));
});

// ══════════════════════════════════════════════════════════════
// PROCESSOS
// ══════════════════════════════════════════════════════════════
const procBase = () => ({ advogado_uid: UID, status: 'andamento', progresso: 0, valor: 150000, instancia: 1, hon_pendente: 0, hon_total_acumulado: 0 });
test('criar processo normal passa; causa bilionária falha', async () => {
  await assertSucceeds(addDoc(collection(eu(), 'processos'), procBase()));
  await assertFails(addDoc(collection(eu(), 'processos'), { ...procBase(), valor: 5e9 }));
  await assertFails(addDoc(collection(eu(), 'processos'), { ...procBase(), status: 'recurso_pendente', hon_pendente: 1e9 }));
});
test('jogar o processo passa; mexer em honorário pendente falha', async () => {
  await semRegras((db) => setDoc(doc(db, 'processos', 'p1'), procBase()));
  const ref = doc(eu(), 'processos', 'p1');
  await assertSucceeds(updateDoc(ref, { progresso: 40, rodada_audiencia: 1 }));
  await assertFails(updateDoc(ref, { hon_pendente: 1e9 }));
  await assertFails(updateDoc(ref, { hon_antecipado: 0, hon_pendente: 5 }));
  await assertFails(updateDoc(ref, { xp_parcial_creditado: true }));
});
