// Limites - refactor (2026-07-07)
// Script responsável pelas funcionalidades de distribuição mensal, validação e resumo

const MONTHS_SHORT=['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
const GIDS=['PASSAGENS E DIÁRIAS','SERVIÇOS DE TERCEIROS PJ','MATERIAL DE CONSUMO'];
const MAPPS=[
  {v:'3',l:'3 - Manutenção das Unidades de Internação',t:'MANUTENÇÃO'},
  {v:'5',l:'5 - Gestão e Manutenção de Serviços',t:'GESTÃO'},
  {v:'12',l:'12 - Fortalecimento da Assistência Social',t:'FINALÍSTICO'}
];

const mappOpts='<option value="">Selecione...</option>'+MAPPS.map(m=>`<option value="${m.v}" data-tipo="${m.t}">${m.l}</option>`).join('');
const gidOpts=GIDS.map(g=>`<option>${g}</option>`).join('');

let currentTipo=null, suplCount=0, remajCount=0, gidUid=0;
let activeUids = [];

function buildDuodForGid(gidUidVal, labelVerb){
  const verb = labelVerb || (currentTipo==='suplementacao'?'Suplementar':'Remanejar');
  activeUids.push(gidUidVal);
  
  let html=`
  <div class="duod-wrap">
    <div class="duod-header-actions">
      <div class="duod-label">Distribuição mensal — A ${verb}</div>
      <div class="auto-dist-box">
        <input type="number" id="total-input-${gidUidVal}" placeholder="Valor Total Teto (R$)" min="0" step="0.01" oninput="validarTeto(${gidUidVal}, 'teto')">
        <button type="button" class="btn-action-small" onclick="distribuirIgual(${gidUidVal})">Distribuir igualmente</button>
      </div>
    </div>
    <div class="dgrid">`;

  MONTHS_SHORT.forEach((m,i)=>{
    html+=`<div class="dm">
      <div class="dm-head">${m}</div>
      <div class="dm-body">
        <div class="df"><div class="dfl">Atual</div><input type="text" readonly placeholder="R$ 0,00"></div>
        <div class="df"><div class="dfl">Valor</div><input type="number" id="sup-${gidUidVal}-${i}" placeholder="0,00" min="0" step="0.01" oninput="validarTeto(${gidUidVal}, 'mes')"></div>
      </div>
    </div>`;
  });
  html+=`
    </div>
    <div class="error-msg-box" id="error-${gidUidVal}">⚠️ A soma distribuída nos meses não pode ultrapassar o valor total definido.</div>
  </div>`;
  return html;
}

// VALIDAÇÃO EM TEMPO REAL E REDUÇÃO AUTOMÁTICA DO TETO
function validarTeto(uid, origemAlteracao) {
  const inputTeto = document.getElementById(`total-input-${uid}`);
  const errorBox = document.getElementById(`error-${uid}`);
  const blockWrapper = inputTeto.closest('.gid-block') || inputTeto.closest('.item-block');
  
  let tetoMax = parseFloat(inputTeto.value) || 0;

  // 1. Calcula a soma atualizada de todos os meses
  let somaMeses = 0;
  for(let i = 0; i < 12; i++) {
    const inp = document.getElementById(`sup-${uid}-${i}`);
    somaMeses += parseFloat(inp && inp.value ? inp.value : 0) || 0;
  }

  // 2. REQUISITO DE USABILIDADE: Se alterou nos meses e a soma ficou menor (ou se reduziu de forma geral), ajusta o total automaticamente
  if (origemAlteracao === 'mes' && parseFloat(somaMeses.toFixed(2)) <= parseFloat((parseFloat(tetoMax)||0).toFixed(2))) {
    inputTeto.value = somaMeses > 0 ? parseFloat(somaMeses.toFixed(2)) : '';
    tetoMax = somaMeses;
  }

  // Se o usuário não definiu um teto e não há valores preenchidos nos meses, remove estados de erro
  if (tetoMax <= 0 && somaMeses === 0) {
    if(blockWrapper) blockWrapper.classList.remove('has-error');
    if(errorBox) errorBox.style.display = 'none';
    checkFormBlockState();
    buildResumo();
    return;
  }

  // 3. Valida se ultrapassou o teto delimitado
  if (parseFloat(somaMeses.toFixed(2)) > parseFloat(tetoMax.toFixed(2))) {
    if(blockWrapper) blockWrapper.classList.add('has-error');
    if(errorBox) errorBox.style.display = 'flex';
  } else {
    if(blockWrapper) blockWrapper.classList.remove('has-error');
    if(errorBox) errorBox.style.display = 'none';
  }

  checkFormBlockState();
  buildResumo();
}

// GERENCIA O BLOQUEIO GERAL DO BOTÃO SALVAR SE HOUVER ALGUM BLOCO COM ERRO
function checkFormBlockState() {
  const hasErrors = document.querySelectorAll('.has-error').length > 0;
  document.getElementById('btnSalvar').disabled = hasErrors;
}

function distribuirIgual(uid) {
  const totalVal = parseFloat(document.getElementById(`total-input-${uid}`).value) || 0;
  if(totalVal <= 0) return;

  const valorMensal = parseFloat((totalVal / 12).toFixed(2));
  const diferencaArredondamento = parseFloat((totalVal - (valorMensal * 11)).toFixed(2));

  for(let i = 0; i < 12; i++) {
    const inputMes = document.getElementById(`sup-${uid}-${i}`);
    if(i === 11) {
      inputMes.value = diferencaArredondamento;
    } else {
      inputMes.value = valorMensal;
    }
  }
  validarTeto(uid, 'teto');
}

function addSupl(initial) {
  const id=suplCount++;
  const div=document.createElement('div');
  div.className='item-block'; div.id='supl-block-'+id;
  div.innerHTML=`
    <div class="item-block-head">    
      <div class="item-block-num"><span class="num-badge">${id+1}</span> MAPP</div>
    </div>
    <div class="item-block-body">
      <div class="frow">
        <div class="fg"><label class="fl req">MAPP</label><select>${mappOpts}</select></div>
      </div>
      <div id="gids-supl-${id}"></div>
    </div>`;
  document.getElementById('suplBlocks').appendChild(div);

  // hook to propagate mapp selection to child gid blocks
  const mappSelect = div.querySelector('select');
  if(mappSelect){
    mappSelect.addEventListener('change', ()=>{
      // update dataset on existing child gid-blocks
      const parentItem = document.getElementById('supl-block-'+id);
      const val = mappSelect.value;
      parentItem.querySelectorAll('.gid-block').forEach(gb=> gb.dataset.mapp = val);
      buildResumo();
    });
  }

  // add first gid
  addGidToSupl(id);
}

function addGidToSupl(suplId){
  const uid=gidUid++;
  const div=document.createElement('div');
  div.className='gid-block';
  div.innerHTML=`
    <div class="gid-block-body">
      <div class="frow"><div class="fg"><label class="fl req">GID</label><select>${gidOpts}</select></div></div>
    </div>${buildDuodForGid(uid)}`;

  const container = document.getElementById('gids-supl-'+suplId);
  container.appendChild(div);

  // associate current MAPP (from parent item-block) to this gid-block
  const parentItem = document.getElementById('supl-block-'+suplId);
  const parentMapp = parentItem ? parentItem.querySelector('select') : null;
  div.dataset.mapp = parentMapp ? parentMapp.value : '';

  // when user later changes the MAPP in parent, the listener in addSupl will update this dataset
}

function addRemaj(){
  const id=remajCount++;
  const div=document.createElement('div');
  div.className='item-block'; div.id='remaj-block-'+id;
  div.innerHTML=`
    <div class="item-block-head"><div class="item-block-num"><span class="num-badge">${id+1}</span> Remanejamento</div></div>
    <div class="item-block-body">
      <div class="remaj-group">
        <div class="remaj-group-head origem"><span class="remaj-group-title">📤 Origem (Redução)</span></div>
        <div class="remaj-group-body" id="orig-${id}"></div>
      </div>
      <div class="remaj-group">
        <div class="remaj-group-head destino"><span class="remaj-group-title">📥 Destino (Acréscimo)</span></div>
        <div class="remaj-group-body" id="dest-${id}"></div>
      </div>
    </div>`;
  document.getElementById('remajBlocks').appendChild(div);
  addRemajLeg('orig-'+id,'orig');
  addRemajLeg('dest-'+id,'dest');
}

function addRemajLeg(containerId, tipo){
  const uid=gidUid++;
  const div=document.createElement('div');
  div.innerHTML=`
    <div class="frow">
      <div class="fg"><label class="fl req">MAPP</label><select>${mappOpts}</select></div>
      <div class="fg"><label class="fl req">GID</label><select>${gidOpts}</select></div>
    </div>${buildDuodForGid(uid, tipo==='orig'?'Reduzir':'Acrescentar')}`;

  document.getElementById(containerId).appendChild(div);

  // associate the gid-block (inside this div) with the local MAPP select and listen for changes
  const gidBlock = div.querySelector('.gid-block');
  const mappSelect = div.querySelector('select');
  if(gidBlock && mappSelect){
    gidBlock.dataset.mapp = mappSelect.value;
    mappSelect.addEventListener('change', ()=>{
      gidBlock.dataset.mapp = mappSelect.value;
      buildResumo();
    });
  }
}

const base={
  MANUTENÇÃO:[{mapp:'3',desc:'Manutenção Unidades',gid:'SERVIÇOS PJ',deliberado:1240000,revisado:1240000}],
  FINALÍSTICO:[{mapp:'12',desc:'Fortalecimento Social',gid:'MATERIAL CONSUMO',deliberado:650000,revisado:650000}],
  GESTÃO:[{mapp:'5',desc:'Gestão e Manutenção',gid:'DIÁRIAS',deliberado:320000,revisado:320000}]
};

function fmt(v){ return 'R$ '+v.toLocaleString('pt-BR',{minimumFractionDigits:2}); }

function buildResumo(){
  const body=document.getElementById('resumoBody'); if(!body) return;
  body.innerHTML='';

  // 1) prepare totals from base
  const categories = ['MANUTENÇÃO','FINALÍSTICO','GESTÃO'];
  let totals={};
  categories.forEach(cat=>{
    totals[cat]={d:0,r:0};
    base[cat].forEach(e=>{ totals[cat].d += e.deliberado; totals[cat].r += e.deliberado; });
  });

  // 2) collect adjustments by mapp (sum of month inputs for each gid-block)
  const adjustmentsByMapp = {};
  document.querySelectorAll('.gid-block').forEach(gb=>{
    // determine sign (origem/destino)
    const duodLabelEl = gb.querySelector('.duod-label');
    let sign = 1;
    if(duodLabelEl){
      const txt = duodLabelEl.textContent || '';
      if(/reduz/i.test(txt)) sign = -1;
      else if(/acrescen|acres/i.test(txt)) sign = 1;
      else sign = (currentTipo==='suplementacao' ? 1 : 1);
    }

    // find mapp associated
    const mappVal = gb.dataset.mapp || '';
    if(!mappVal) return; // skip unassociated

    let soma = 0;
    gb.querySelectorAll('input[id^="sup-"]').forEach(inp=>{ soma += parseFloat(inp.value) || 0; });

    adjustmentsByMapp[mappVal] = (adjustmentsByMapp[mappVal] || 0) + (sign * soma);
  });

  // 3) build rows: for each category header + entries
  categories.forEach(cat=>{
    const trCat=document.createElement('tr'); trCat.className='cat-hd';
    trCat.innerHTML=`<td colspan="5">▾ MAPP ${cat}</td>`;
    body.appendChild(trCat);

    base[cat].forEach(r=>{
      const adj = adjustmentsByMapp[r.mapp] || 0;
      const revised = r.deliberado + adj;
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>MAPP ${r.mapp} - ${r.gid}</td><td>${fmt(r.deliberado)}</td><td>${fmt(revised)}</td><td>${fmt(revised - r.deliberado)}</td><td>100%</td>`;
      body.appendChild(tr);
    });
  });

  // 4) grand totals
  let totalD=0, totalR=0;
  categories.forEach(cat=>{ totalD += totals[cat].d; totalR += totals[cat].r; });
  // totals.r were base deliberado sums; but we must add adjustments sum
  let adjustmentsSum = 0; Object.keys(adjustmentsByMapp).forEach(k=> adjustmentsSum += adjustmentsByMapp[k]);
  totalR = totalD + adjustmentsSum;

  const trG=document.createElement('tr'); trG.className='grand-row';
  trG.innerHTML=`<td>TOTAL GERAL</td><td>${fmt(totalD)}</td><td>${fmt(totalR)}</td><td>${fmt(totalR-totalD)}</td><td>-</td>`;
  body.appendChild(trG);

  // 5) enable/disable submit: require at least one gid-block, justificativa and no errors
  const hasGid = document.querySelectorAll('.gid-block').length > 0;
  const justific = (document.getElementById('justificativa')&&document.getElementById('justificativa').value.trim())||'';
  const hasErrors = document.querySelectorAll('.has-error').length > 0;
  const btn = document.getElementById('btnSalvar');
  if(btn) btn.disabled = (hasErrors || !hasGid || justific.length===0);
}

function selectTipo(tipo){
  currentTipo=tipo;
  activeUids = [];
  document.getElementById('stepSel').classList.add('hidden');
  document.getElementById('mainForm').classList.remove('hidden');
  document.getElementById('tipoBadge').textContent=tipo.toUpperCase();
  if(tipo==='suplementacao'){
    document.getElementById('suplementacaoSection').classList.remove('hidden');
    document.getElementById('remanejamentoSection').classList.add('hidden');
    document.getElementById('suplBlocks').innerHTML=''; suplCount=0; addSupl(true);
  }else{
    document.getElementById('remanejamentoSection').classList.remove('hidden');
    document.getElementById('suplementacaoSection').classList.add('hidden');
    document.getElementById('remajBlocks').innerHTML=''; remajCount=0; addRemaj();
  }
  // wire justificativa change to trigger resumo update
  const just = document.getElementById('justificativa');
  if(just){ just.addEventListener('input', buildResumo); }

  checkFormBlockState();
  buildResumo();
}

function resetForm(){
  document.getElementById('mainForm').classList.add('hidden');
  document.getElementById('stepSel').classList.remove('hidden');
}

// Attachments handling (display names only)
(function wireAttachments(){
  const fileInput = document.getElementById('fileInput');
  const list = document.getElementById('attachmentsList');
  if(!fileInput || !list) return;
  fileInput.addEventListener('change', ()=>{
    const files = Array.from(fileInput.files||[]);
    list.innerHTML = files.map(f=>`<div style="font-size:13px;padding:6px 0">📎 ${f.name}</div>`).join('');
    // optional: keep in memory or localStorage (names only)
    try{ localStorage.setItem('limites_attachments', JSON.stringify(files.map(f=>f.name))); }catch(e){}
  });

  // restore names when available
  try{
    const saved = JSON.parse(localStorage.getItem('limites_attachments')||'[]');
    if(saved && saved.length) list.innerHTML = saved.map(n=>`<div style="font-size:13px;padding:6px 0">📎 ${n}</div>`).join('');
  }catch(e){}
})();

// initial buildResumo run (in case index loaded with items)
document.addEventListener('DOMContentLoaded', ()=>{
  buildResumo();
});
