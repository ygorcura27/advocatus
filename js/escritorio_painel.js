/**
 * ESCRITÓRIO PAINEL — Advocatus Online
 * Renderização das cards de Equipe, Clientes e Oportunidades no painel do escritório
 */

import { collection, query, orderBy, limit, getDocs, where, doc, getDoc }
  from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-init.js';

const CARGO_INFO = {
  soc: { l: 'Sócio', ordem: 6 },
  asc: { l: 'Associado', ordem: 5 },
  snr: { l: 'Advogado Sênior', ordem: 4 },
  pln: { l: 'Advogado Pleno', ordem: 3 },
  jnr: { l: 'Advogado Júnior', ordem: 2 },
  ass: { l: 'Assistente Jurídico', ordem: 1 },
  est: { l: 'Estagiário', ordem: 0 },
};

// Gerar placeholder redondo SVG com iniciais
function _getPlaceholder(nome) {
  const iniciais = (nome || '?')
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  const bgColor = '#2E4270';
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Ccircle cx='20' cy='20' r='20' fill='${encodeURIComponent(bgColor)}'/%3E%3Ctext x='20' y='27' font-size='14' font-weight='bold' fill='%23fff' text-anchor='middle' font-family='Arial'%3E${iniciais}%3C/text%3E%3C/svg%3E`;
}

// Renderizar equipe do escritório (máx 5) no painel
window.renderEquipePainel = async function(j, escId, el) {
  try {
    const fSnap = await getDocs(
      query(collection(db, 'escritorios', escId, 'funcionarios'), orderBy('criado_em', 'asc'))
    );
    
    const funcs = fSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    // Ordenar por importância: Sócios > Associados > Advogados > Assistentes > Estagiários
    funcs.sort((a, b) => {
      const ordemA = CARGO_INFO[a.cargo_id]?.ordem ?? -1;
      const ordemB = CARGO_INFO[b.cargo_id]?.ordem ?? -1;
      return ordemB - ordemA;
    });
    
    const top5 = funcs.slice(0, 5);
    const temMais = funcs.length > 5;
    
    let html = '';
    
    if (top5.length === 0) {
      html = '<div style="font-size:.78rem;color:var(--txt3);padding:.5rem 0;text-align:center">Nenhum membro na equipe</div>';
    } else {
      html = '<div style="display:flex;flex-direction:column;gap:.6rem">';
      
      for (const func of top5) {
        const cargoLabel = CARGO_INFO[func.cargo_id]?.l || func.cargo_id;
        const nome = func.nome || func.name || `${cargoLabel} #${func.id.slice(0, 4)}`;
        const esp = func.especialidade || '—';
        const placeholder = _getPlaceholder(nome);
        
        html += `
        <div style="display:flex;align-items:center;gap:.6rem;padding:.6rem;background:var(--surface2);border-radius:var(--r);border:1px solid var(--borda-sub)">
          <img src="${placeholder}" alt="${nome}" style="width:40px;height:40px;border-radius:50%;flex-shrink:0;object-fit:cover" />
          <div style="flex:1;min-width:0">
            <div style="font-size:.80rem;font-weight:700;color:#1a3a52;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nome}</div>
            <div style="font-size:.65rem;color:var(--txt4)">${cargoLabel} · ${esp}</div>
          </div>
          <div style="display:flex;gap:.3rem;flex-shrink:0">
            <button class="btn btn-icon btn-sm" title="Designar Processo" onclick="window.navTo('processos',null)" style="padding:.3rem .4rem;font-size:.7rem">📋</button>
            <button class="btn btn-icon btn-sm" title="Demitir" onclick="if(confirm('Desligar ${nome}?')) console.log('demitir:${func.id}')" style="padding:.3rem .4rem;font-size:.7rem">✕</button>
          </div>
        </div>`;
      }
      
      html += '</div>';
      
      if (temMais) {
        html += `<div style="text-align:center;margin-top:.8rem"><button class="btn btn-sec btn-sm" onclick="window.navTo('equipe',null)">Ver todos (${funcs.length})</button></div>`;
      } else {
        html += `<div style="text-align:center;margin-top:.8rem"><button class="btn btn-prim btn-sm" onclick="window.navTo('equipe',null)">Gerenciar Equipe</button></div>`;
      }
    }
    
    el.innerHTML = html;
  } catch (err) {
    console.error('[EQUIPE PAINEL]', err);
    el.innerHTML = '<div style="color:var(--txt3);font-size:.75rem">Erro ao carregar equipe</div>';
  }
};

// Renderizar clientes corporativos (máx 5) no painel
window.renderClientesPainel = async function(j, escId, el) {
  try {
    // Buscar processos sem usar orderBy no 'valor' para evitar erro de índice
    const procsSnap = await getDocs(
      query(
        collection(db, 'processos'),
        where('escritorio_id', '==', escId)
      )
    );
    
    const procs = procsSnap.docs.map(d => d.data());
    
    // Agrupar por cliente (autor/reu) e somar
    const clienteMap = {};
    procs.forEach(p => {
      const cliente = p.autor || p.reu || 'Cliente Desconhecido';
      if (!clienteMap[cliente]) {
        clienteMap[cliente] = { nome: cliente, processos: 0, faturamento: 0, pagamentoMensal: 0 };
      }
      clienteMap[cliente].processos += 1;
      clienteMap[cliente].faturamento += p.valor || 0;
      clienteMap[cliente].pagamentoMensal = Math.round((clienteMap[cliente].faturamento / 12) * 0.1);
    });
    
    // Converter para array, ordenar por faturamento (client-side), pegar top 5
    const clientes = Object.values(clienteMap)
      .sort((a, b) => b.faturamento - a.faturamento)
      .slice(0, 5);
    
    let html = '';
    
    if (clientes.length === 0) {
      html = '<div style="font-size:.78rem;color:var(--txt3);padding:.5rem 0;text-align:center">Nenhum cliente cadastrado</div>';
    } else {
      html = '<div style="display:flex;flex-direction:column;gap:.4rem">';
      
      for (const cliente of clientes) {
        const fmtFat = cliente.faturamento >= 1000000 
          ? `R$${(cliente.faturamento/1000000).toFixed(1)}M` 
          : cliente.faturamento >= 1000 
          ? `R$${(cliente.faturamento/1000).toFixed(0)}k` 
          : `R$${cliente.faturamento}`;
        
        const fmtPag = cliente.pagamentoMensal >= 1000
          ? `R$${(cliente.pagamentoMensal/1000).toFixed(0)}k`
          : `R$${cliente.pagamentoMensal}`;
        
        html += `
        <div style="display:grid;grid-template-columns:1fr auto;gap:.5rem;padding:.5rem;background:var(--surface2);border-radius:var(--r);border:1px solid var(--borda-sub)">
          <div>
            <div style="font-size:.78rem;font-weight:600;color:var(--navy);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${cliente.nome}</div>
            <div style="font-size:.65rem;color:var(--txt4)">📁 ${cliente.processos} processo${cliente.processos !== 1 ? 's' : ''}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:.78rem;font-weight:600;color:var(--verde2)">${fmtPag}/mês</div>
            <div style="font-size:.65rem;color:var(--txt4)">${fmtFat}</div>
          </div>
        </div>`;
      }
      
      html += '</div>';
      
      if (Object.keys(clienteMap).length > 5) {
        html += `<div style="text-align:center;margin-top:.6rem"><button class="btn btn-sec btn-sm" onclick="window.navTo('clientes',null)">Ver todos (${Object.keys(clienteMap).length})</button></div>`;
      } else {
        html += `<div style="text-align:center;margin-top:.6rem"><button class="btn btn-prim btn-sm" onclick="window.navTo('clientes',null)">Gerenciar Clientes</button></div>`;
      }
    }
    
    el.innerHTML = html;
  } catch (err) {
    console.error('[CLIENTES PAINEL]', err);
    el.innerHTML = '<div style="color:var(--txt3);font-size:.75rem">Erro ao carregar clientes</div>';
  }
};

// Renderizar oportunidades do mês (máx 5) - carrega da coleção 'eventos'
window.renderOportunidadesPainel = async function(j, escId, el) {
  try {
    // Carregar eventos do mês vigente
    const eventsSnap = await getDocs(
      query(
        collection(db, 'eventos'),
        where('ativo', '==', true),
        limit(50)
      )
    );
    
    const oportunidades = eventsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .slice(0, 5);
    
    let html = '';
    
    if (oportunidades.length === 0) {
      html = '<div style="font-size:.78rem;color:var(--txt3);padding:.5rem 0;text-align:center">Nenhuma oportunidade disponível</div>';
    } else {
      html = '<div style="display:flex;flex-direction:column;gap:.4rem">';
      
      for (const op of oportunidades) {
        const titulo = op.titulo || 'Oportunidade';
        const desc = op.descricao || '';
        // Usar ícone customizado ou emoji padrão
        const icone = op.icone || '🌟';
        
        html += `
        <div style="padding:.5rem;background:var(--surface2);border-radius:var(--r);border-left:3px solid var(--ouro2)">
          <div style="display:flex;align-items:center;gap:.4rem;margin-bottom:.3rem">
            <span style="font-size:.9rem">${icone}</span>
            <div style="font-size:.78rem;font-weight:600;color:var(--navy);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${titulo}</div>
          </div>
          ${desc ? `<div style="font-size:.65rem;color:var(--txt4);margin-left:1.3rem">${desc}</div>` : ''}
        </div>`;
      }
      
      html += '</div>';
    }
    
    el.innerHTML = html;
  } catch (err) {
    console.error('[OPORTUNIDADES PAINEL]', err);
    el.innerHTML = '<div style="color:var(--txt3);font-size:.75rem">Erro ao carregar oportunidades</div>';
  }
};
