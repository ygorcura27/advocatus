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
      html = '<div style="display:flex;flex-direction:column;gap:.4rem">';
      
      for (const func of top5) {
        const cargoLabel = CARGO_INFO[func.cargo_id]?.l || func.cargo_id;
        const nome = func.nome || func.name || `${cargoLabel} #${func.id.slice(0, 4)}`;
        const esp = func.especialidade || '—';
        
        html += `
        <div style="display:flex;align-items:center;gap:.5rem;padding:.5rem;background:var(--surface2);border-radius:var(--r);border:1px solid var(--borda-sub)">
          <span style="font-size:1rem;flex-shrink:0">${_getCargoIcon(func.cargo_id)}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:.78rem;font-weight:600;color:var(--navy);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nome}</div>
            <div style="font-size:.65rem;color:var(--txt4)">${cargoLabel} · ${esp}</div>
          </div>
        </div>`;
      }
      
      html += '</div>';
      
      if (temMais) {
        html += `<div style="text-align:center;margin-top:.6rem"><button class="btn btn-sec btn-sm" onclick="window.navTo('equipe',null)">Ver todos (${funcs.length})</button></div>`;
      } else {
        html += `<div style="text-align:center;margin-top:.6rem"><button class="btn btn-prim btn-sm" onclick="window.navTo('equipe',null)">Gerenciar Equipe</button></div>`;
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
    // Para este MVP, vamos simular clientes com base nos processos do escritório
    // Em uma versão futura, haveria uma coleção de "clientes_corporativos"
    const procsSnap = await getDocs(
      query(
        collection(db, 'processos'),
        where('escritorio_id', '==', escId),
        orderBy('valor', 'desc'),
        limit(50)
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
      // Estimar pagamento mensal como 10% do faturamento total / 12 meses
      clienteMap[cliente].pagamentoMensal = Math.round((clienteMap[cliente].faturamento / 12) * 0.1);
    });
    
    // Converter para array e ordenar por faturamento
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
            <div style="font-size:.65rem;color:var(--txt4)">Faturamento: ${fmtFat}</div>
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

// Renderizar oportunidades do mês (máx 5)
window.renderOportunidadesPainel = async function(j, escId, el) {
  try {
    // Para este MVP, simulamos oportunidades com base em eventos do escritório
    // Em uma versão futura, haveria uma coleção de "oportunidades"
    const oportunidades = [
      { titulo: 'Expansão para área ambiental', descricao: 'Mercado crescente, alta demanda', icone: '🌱' },
      { titulo: 'Parcerias com bancos', descricao: 'Projetos de financiamento', icone: '🏦' },
      { titulo: 'Consultoria tributária', descricao: 'Clientes corporativos buscando assessoria', icone: '💰' },
      { titulo: 'Certificação ISO', descricao: 'Aumentar credibilidade', icone: '✅' },
      { titulo: 'Programa de mentorado', descricao: 'Treinar próxima geração', icone: '🎓' },
    ];
    
    const top5 = oportunidades.slice(0, 5);
    const temMais = oportunidades.length > 5;
    
    let html = `
    <div class="esc-card-bloco">
      <div class="secao-header" style="margin-bottom:.8rem">
        <div class="secao-titulo">Oportunidades do Mês</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:.4rem">`;
    
    for (const op of top5) {
      html += `
      <div style="padding:.5rem;background:var(--surface2);border-radius:var(--r);border-left:3px solid var(--ouro2)">
        <div style="display:flex;align-items:center;gap:.4rem;margin-bottom:.3rem">
          <span style="font-size:.9rem">${op.icone}</span>
          <div style="font-size:.78rem;font-weight:600;color:var(--navy);flex:1">${op.titulo}</div>
        </div>
        <div style="font-size:.65rem;color:var(--txt4);margin-left:1.3rem">${op.descricao}</div>
      </div>`;
    }
    
    html += '</div>';
    
    if (temMais) {
      html += `<div style="text-align:center;margin-top:.6rem"><button class="btn btn-sec btn-sm" onclick="window.navTo('escritorio',null)">Ver todas as oportunidades</button></div>`;
    }
    
    html += '</div>';
    
    el.innerHTML = html;
  } catch (err) {
    console.error('[OPORTUNIDADES PAINEL]', err);
    el.innerHTML = '<div style="color:var(--txt3);font-size:.75rem">Erro ao carregar oportunidades</div>';
  }
};

// Ícones por cargo
function _getCargoIcon(cargoId) {
  const iconMap = {
    soc: '👔',
    asc: '⚖️',
    snr: '📌',
    pln: '📋',
    jnr: '📝',
    ass: '📄',
    est: '🎓',
  };
  return iconMap[cargoId] || '👤';
}
