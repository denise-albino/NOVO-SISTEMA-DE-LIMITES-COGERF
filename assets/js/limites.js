// Limites - refactor (2026-07-07) - updated
// Alterações:
// - Não alteramos mais o campo "total" quando o usuário modifica os meses;
//   agora exigimos que a soma dos meses seja igual ao total para permitir salvar.
// - Mensagens de erro mais claras (menor/maior que o total).
// - Adicionado suporte a anexos (input type=file) — nomes salvos em rascunho (não o conteúdo).

(function(window){
  // Constantes e dados
  const MONTHS_SHORT=['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
  const GIDS=['PASSAGENS E DIÁRIAS','SERVIÇOS DE TERCEIROS PJ','MATERIAL DE CONSUMO'];
  const MAPPS=[
    {v:'3',l:'3 - Manutenção das Unidades de Internação',t:'MANUTENÇÃO'},
    {v:'5',l:'5 - Gestão e Manutenção de Serviços',t:'GESTÃO'},
    {v:'12',l:'12 - Fortalecimento da Assistência Social',t:'FINALÍSTICO'}
  ];
  const mappOpts='<option value="">Selecione...</option>'+MAPPS.map(m=>`<option value="${m.v}" data-tipo="${m.t}">${m.l}</option>`).join('');
  const gidOpts=GIDS.map(g=>`<option>${g}</option>`).join('');

  // Estado
  let currentTipo=null, suplCount=0, remajCount=0, gidUid=0;
  let activeUids = [];

  const STORAGE_KEY = 'limites_solicitacao_draft_v1';

  // ---------- FUNÇÕES PURAS (testáveis) ----------
  function distribuirIgualCalc(total){
    const totalCent = Math.round(Number(total) * 100);
    if (!isFinite(totalCent) || totalCent <= 0) return Array(12).fill(0);
    const baseCent = Math.floor(totalCent / 12);
    let resto = totalCent - baseCent * 12;
    const arr = Array(12).fill(baseCent);
    // distribuir o resto nos últimos meses (para que os primeiros fiquem iguais)
    for (let i = 11; resto > 0 && i >= 0; i--, resto--) arr[i] = arr[i] + 1;
    return arr.map(c => c / 100);
  }

  function findMaxUid(){
    const nodes = Array.from(document.querySelectorAll('[id^="sup-"]'));
    let max = -1;
    nodes.forEach(n=>{
      const m = n.id.match(/^sup-(\d+)-\d+$/);
      if (m) {
        const v = parseInt(m[1],10);
        if (v > max) max = v;
      }
    });
    return max;
  }

  // ---------- UI BUILDERS ----------
  function buildDuodForGid(gidUidVal, labelVerb){
    const verb = labelVerb || (currentTipo==='suplementacao'?'Suplementar':'Remanejar');
    activeUids.push(gidUidVal);
    let html=`<div class="duod-wrap" data-uid="${gidUidVal}">
      <div class="duod-header-actions">
        <div class="duod-label">Distribuição mensal — A ${verb}</div>
        <div class="auto-dist-box">
          <input type="number" id="total-input-${gidUidVal}" placeholder="Valor Total Teto (R$)" min="0" step="0.01">
          <button type="button" class="btn-action-small" data-action="distribuir" data-uid="${gidUidVal}">Distribuir igualmente</button>
          <button type="button" class="btn-action-small" data-action="remove-gid" data-uid="${gidUidVal}" style="background:#fff;border:1px solid #ddd;color:#c0392b;margin-left:8px;">Remover</button>
        </div>
      </div>
      <div class="dgrid">`;

    MONTHS_SHORT.forEach((m,i)=>{
      html+=`<div class="dm">
        <div class="dm-head">${m}</div>
        <div class="dm-body">
          <div class="df"><div class="dfl">Atual</div><input type="text" readonly placeholder="R$ 0,00"></div>
          <div class="df"><div class="dfl">Valor</div><input type="number" id="sup-${gidUidVal}-${i}" placeholder="0,00" min="0" step="0.01"></div>
        </div>
      </div>`;
    });
    html+=`</div><div class="error-msg-box" id="error-${gidUidVal}">⚠️ A soma distribuída nos meses não pode ultrapassar o valor total definido.</div></div>`;
    return html;
  }

  // ---------- MAIN BEHAVIORS ----------
  function validarTeto(uid, origemAlteracao){
    try {
      const inputTeto = document.getElementById(`total-input-${uid}`);
      const errorBox = document.getElementById(`error-${uid}`);
      const sup0 = document.getElementById(`sup-${uid}-0`);
      const blockWrapper = inputTeto ? (inputTeto.closest('.gid-block') || inputTeto.closest('.item-block')) : (sup0 ? sup0.closest('.gid-block') || sup0.closest('.item-block') : null);

      if (!inputTeto && !sup0) return;

      let tetoMax = parseFloat(inputTeto && inputTeto.value) || 0;

      // Soma meses de forma segura
      let somaMeses = 0;
      for (let i=0;i<12;i++){
        const el = document.getElementById(`sup-${uid}-${i}`);
        if (el) somaMeses += parseFloat(el.value) || 0;
      }

      // NÃO alteramos mais o teto automaticamente quando o usuário editar os meses.
      // Em vez disso, mostramos erro quando soma != teto e impedimos salvar.

      // Se usuário não definiu teto e não há meses preenchidos => limpa erro
      if (tetoMax <= 0 && somaMeses === 0) {
        if (blockWrapper) blockWrapper.classList.remove('has-error');
        if (errorBox) errorBox.style.display = 'none';
        checkFormBlockState();
        buildResumo();
        saveDraft();
        return;
      }

      // Validações e mensagens específicas
      if (parseFloat(somaMeses.toFixed(2)) > parseFloat(tetoMax.toFixed(2))) {
        if (blockWrapper) blockWrapper.classList.add('has-error');
        if (errorBox) { errorBox.style.display = 'flex'; errorBox.textContent = '⚠️ A soma dos meses ultrapassa o valor total definido. Ajuste os meses ou reduza o total.'; }
      } else if (parseFloat(somaMeses.toFixed(2)) < parseFloat(tetoMax.toFixed(2))) {
        if (blockWrapper) blockWrapper.classList.add('has-error');
        if (errorBox) { errorBox.style.display = 'flex'; errorBox.textContent = '⚠️ A soma dos meses é menor que o valor total. Distribua exatamente o total para prosseguir.'; }
      } else {
        if (blockWrapper) blockWrapper.classList.remove('has-error');
        if (errorBox) errorBox.style.display = 'none';
      }

      checkFormBlockState();
      buildResumo();
      saveDraft();
    } catch (e) {
      console.error('validarTeto erro', e);
    }
  }

  function checkFormBlockState(){
    const hasErrors = document.querySelectorAll('.has-error').length > 0;
    const btnSalvar = document.getElementById('btnSalvar');
    if (btnSalvar) btnSalvar.disabled = hasErrors;
  }

  function distribuirIgual(uid){
    const inputTeto = document.getElementById(`total-input-${uid}`);
    const totalVal = parseFloat(inputTeto && inputTeto.value) || 0;
    if (totalVal <= 0) return;
    const arr = distribuirIgualCalc(totalVal);
    // aplicar nos inputs
    for (let i=0;i<12;i++){
      const inputMes = document.getElementById(`sup-${uid}-${i}`);
      if (inputMes) inputMes.value = arr[i].toFixed(2);
    }
    validarTeto(uid, 'teto');
  }

  function addSupl(initial){
    const id = suplCount++;
    const div = document.createElement('div');
    div.className = 'item-block'; div.id = 'supl-block-'+id;
    div.innerHTML = `
      <div class="item-block-head">
        <div class="item-block-num"><span class="num-badge">${id+1}</span> MAPP</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button type="button" class="btn-action-small" data-action="remove-block" data-block="supl-block-${id}" style="background:#fff;border:1px solid #ddd;color:#c0392b;">Remover MAPP</button>
        </div>
      </div>
      <div class="item-block-body">
        <div class="frow">
          <div class="fg"><label class="fl req">MAPP</label><select onchange="buildResumo()">${mappOpts}</select></div>
        </div>
        <div id="gids-supl-${id}"></div>
      </div>`;
    const cont = document.getElementById('suplBlocks');
    if (cont) cont.appendChild(div);
    addGidToSupl(id);
    saveDraft();
  }

  function addGidToSupl(suplId){
    const uid = gidUid++;
    const div = document.createElement('div');
    div.className = 'gid-block';
    div.innerHTML = `<div class="gid-block-body">
      <div class="frow"><div class="fg"><label class="fl req">GID</label><select>${gidOpts}</select></div></div>
    </div>${buildDuodForGid(uid)}`;
    const parent = document.getElementById('gids-supl-'+suplId);
    if (parent) parent.appendChild(div);
    // Attaching events for newly created elements (delegation used later)
    reattachInlineHandlersForUid(uid);
    saveDraft();
  }

  function addRemaj(){
    const id = remajCount++;
    const div = document.createElement('div');
    div.className='item-block'; div.id='remaj-block-'+id;
    div.innerHTML=`
      <div class="item-block-head">
        <div class="item-block-num"><span class="num-badge">${id+1}</span> Remanejamento</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button type="button" class="btn-action-small" data-action="remove-block" data-block="remaj-block-${id}" style="background:#fff;border:1px solid #ddd;color:#c0392b;">Remover Remanejamento</button>
        </div>
      </div>
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
    const cont = document.getElementById('remajBlocks');
    if (cont) cont.appendChild(div);
    addRemajLeg('orig-'+id,'orig');
    addRemajLeg('dest-'+id,'dest');
    saveDraft();
  }

  function addRemajLeg(containerId, tipo){
    const uid = gidUid++;
    const div = document.createElement('div');
    div.innerHTML = `
      <div class="frow">
        <div class="fg"><label class="fl req">MAPP</label><select onchange="buildResumo()">${mappOpts}</select></div>
        <div class="fg"><label class="fl req">GID</label><select>${gidOpts}</select></div>
      </div>${buildDuodForGid(uid, tipo==='orig'?'Reduzir':'Acrescentar')}`;
    const container = document.getElementById(containerId);
    if (container) container.appendChild(div);
    reattachInlineHandlersForUid(uid);
    saveDraft();
  }

  function reattachInlineHandlersForUid(uid){
    const btnDistribuir = document.querySelector(`[data-action="distribuir"][data-uid="${uid}"]`);
    if (btnDistribuir) { btnDistribuir.removeEventListener('click', ()=>distribuirIgual(uid)); btnDistribuir.addEventListener('click', ()=>distribuirIgual(uid)); }
    const btnRemoveGid = document.querySelector(`[data-action="remove-gid"][data-uid="${uid}"]`);
    if (btnRemoveGid) { btnRemoveGid.removeEventListener('click', ()=>removeGid(uid)); btnRemoveGid.addEventListener('click', ()=>removeGid(uid)); }
    for (let i=0;i<12;i++){
      const inMes = document.getElementById(`sup-${uid}-${i}`);
      if (inMes) { inMes.removeEventListener('input', ()=>validarTeto(uid, 'mes')); inMes.addEventListener('input', ()=>validarTeto(uid, 'mes')); }
    }
    const totalInput = document.getElementById(`total-input-${uid}`);
    if (totalInput) { totalInput.removeEventListener('input', ()=>validarTeto(uid, 'teto')); totalInput.addEventListener('input', ()=>validarTeto(uid, 'teto')); }
  }

  function removeGid(uid){
    const wrapper = document.querySelector(`.duod-wrap[data-uid="${uid}"]`);
    if (!wrapper) return;
    const gidBlock = wrapper.closest('.gid-block');
    if (gidBlock) gidBlock.remove();
    activeUids = activeUids.filter(x=>x!==uid);
    checkFormBlockState();
    buildResumo();
    saveDraft();
  }

  function removeBlockById(blockId){
    const el = document.getElementById(blockId);
    if (!el) return;
    const uids = Array.from(el.querySelectorAll('[id^="sup-"]')).map(n=>{
      const m = n.id.match(/^sup-(\d+)-\d+$/);
      return m ? parseInt(m[1],10) : null;
    }).filter(x=>x!==null);
    uids.forEach(u=> activeUids = activeUids.filter(a=>a!==u));
    el.remove();
    checkFormBlockState();
    buildResumo();
    saveDraft();
  }

  function fmt(v){ return 'R$ '+v.toLocaleString('pt-BR',{minimumFractionDigits:2}); }
  function buildResumo(){
    const body=document.getElementById('resumoBody'); if(!body) return;
    body.innerHTML='';
    let totalD=0, totalR=0;

    let totalInput=0;
    document.querySelectorAll('input[id^="sup-"]').forEach(i=>{
      totalInput+=parseFloat(i.value) || 0;
    });

    base['MANUTENÇÃO'][0].revisado = base['MANUTENÇÃO'][0].deliberado + (currentTipo==='suplementacao'?totalInput:0);

    ['MANUTENÇÃO','FINALÍSTICO','GESTÃO'].forEach(cat=>{
      let subD=0, subR=0;
      const trCat=document.createElement('tr'); trCat.className='cat-hd';
      trCat.innerHTML=`<td colspan="5">▾ MAPP ${cat}</td>`;
      body.appendChild(trCat);

      base[cat].forEach(r=>{
        subD+=r.deliberado; subR+=r.revisado;
        const tr=document.createElement('tr');
        tr.innerHTML=`<td>MAPP ${r.mapp} - ${r.gid}</td><td>${fmt(r.deliberado)}</td><td>${fmt(r.revisado)}</td><td>${fmt(r.revisado-r.deliberado)}</td><td>100%</td>`;
        body.appendChild(tr);
      });
      totalD+=subD; totalR+=subR;
    });

    const trG=document.createElement('tr'); trG.className='grand-row';
    trG.innerHTML=`<td>TOTAL GERAL</td><td>${fmt(totalD)}</td><td>${fmt(totalR)}</td><td>${fmt(totalR-totalD)}</td><td>-</td>`;
    body.appendChild(trG);
  }

  function selectTipo(tipo){
    currentTipo=tipo;
    activeUids = [];
    const stepSel = document.getElementById('stepSel');
    const mainForm = document.getElementById('mainForm');
    if (stepSel) stepSel.classList.add('hidden');
    if (mainForm) mainForm.classList.remove('hidden');
    const tipoBadge = document.getElementById('tipoBadge');
    if (tipoBadge) tipoBadge.textContent=tipo.toUpperCase();
    if (tipo==='suplementacao'){
      document.getElementById('suplementacaoSection').classList.remove('hidden');
      document.getElementById('remanejamentoSection').classList.add('hidden');
      document.getElementById('suplBlocks').innerHTML=''; suplCount = 0;
      addSupl(true);
    }else{
      document.getElementById('remanejamentoSection').classList.remove('hidden');
      document.getElementById('suplementacaoSection').classList.add('hidden');
      document.getElementById('remajBlocks').innerHTML=''; remajCount = 0;
      addRemaj();
    }
    checkFormBlockState();
    buildResumo();
    saveDraft();
  }

  function resetForm(){
    const mainForm = document.getElementById('mainForm');
    const stepSel = document.getElementById('stepSel');
    if (mainForm) mainForm.classList.add('hidden');
    if (stepSel) stepSel.classList.remove('hidden');
  }

  // ---------- ANEXOS (UI leve, nomes apenas) ----------
  function renderAttachments(list){
    const el = document.getElementById('attachmentsList');
    if (!el) return;
    el.innerHTML = '';
    (list || []).forEach((name,idx)=>{
      const div = document.createElement('div');
      div.style.padding='6px 8px';
      div.style.border='1px solid #e6e6e6';
      div.style.marginBottom='6px';
      div.style.borderRadius='6px';
      div.textContent = name;
      el.appendChild(div);
    });
  }

  function handleFileInput(e){
    const files = Array.from(e.target.files || []);
    const names = files.map(f=>f.name);
    renderAttachments(names);
    // salvar apenas nomes no rascunho (não conteúdo)
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      const state = raw ? JSON.parse(raw) : {};
      state.attachments = names;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }catch(err){ console.warn('failed to save attachments to draft', err); }
  }

  // ---------- PERSISTÊNCIA (localStorage) ----------
  function saveDraft(){
    try {
      const state = {
        currentTipo: currentTipo,
        suplHtml: document.getElementById('suplBlocks') ? document.getElementById('suplBlocks').innerHTML : '',
        remajHtml: document.getElementById('remajBlocks') ? document.getElementById('remajBlocks').innerHTML : '',
        justificativa: (document.getElementById('justificativa') && document.getElementById('justificativa').value) || '',
        fonte: (document.getElementById('selectFonte') && document.getElementById('selectFonte').value) || '',
        attachments: (function(){ const raw=localStorage.getItem(STORAGE_KEY); try{ const s=raw?JSON.parse(raw):{}; return s.attachments||[] }catch(e){return []}})()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch(e){
      console.warn('saveDraft falhou', e);
    }
  }

  function clearDraft(){
    localStorage.removeItem(STORAGE_KEY);
    const supr = document.getElementById('suplBlocks');
    if (supr) supr.innerHTML = '';
    const rem = document.getElementById('remajBlocks');
    if (rem) rem.innerHTML = '';
    const just = document.getElementById('justificativa');
    if (just) just.value = '';
    const fonte = document.getElementById('selectFonte');
    if (fonte) fonte.value = '';
    const attachments = document.getElementById('attachmentsList'); if (attachments) attachments.innerHTML='';
    const fileInput = document.getElementById('fileInput'); if (fileInput) fileInput.value='';
    suplCount = 0; remajCount = 0; gidUid = 0; activeUids = [];
    saveDraft();
    buildResumo();
  }

  function restoreDraft(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const state = JSON.parse(raw);
      if (state.currentTipo) {
        currentTipo = state.currentTipo;
        document.getElementById('stepSel').classList.add('hidden');
        document.getElementById('mainForm').classList.remove('hidden');
        document.getElementById('tipoBadge').textContent = currentTipo.toUpperCase();
        if (currentTipo === 'suplementacao'){
          document.getElementById('suplementacaoSection').classList.remove('hidden');
          document.getElementById('remanejamentoSection').classList.add('hidden');
        } else {
          document.getElementById('remanejamentoSection').classList.remove('hidden');
          document.getElementById('suplementacaoSection').classList.add('hidden');
        }
      }
      if (state.suplHtml && document.getElementById('suplBlocks')){
        document.getElementById('suplBlocks').innerHTML = state.suplHtml;
      }
      if (state.remajHtml && document.getElementById('remajBlocks')){
        document.getElementById('remajBlocks').innerHTML = state.remajHtml;
      }
      if (state.justificativa && document.getElementById('justificativa')) document.getElementById('justificativa').value = state.justificativa;
      if (state.fonte && document.getElementById('selectFonte')) document.getElementById('selectFonte').value = state.fonte;
      if (state.attachments && Array.isArray(state.attachments)) renderAttachments(state.attachments);

      // reajusta counters e reanexa handlers
      const maxUid = findMaxUid();
      gidUid = Math.max(gidUid, maxUid + 1);
      suplCount = document.querySelectorAll('#suplBlocks .item-block').length;
      remajCount = document.querySelectorAll('#remajBlocks .item-block').length;

      document.querySelectorAll('[data-action="distribuir"]').forEach(b=> {
        const uid = parseInt(b.getAttribute('data-uid'),10);
        b.removeEventListener('click', ()=>distribuirIgual(uid));
        b.addEventListener('click', ()=>distribuirIgual(uid));
      });
      document.querySelectorAll('[data-action="remove-gid"]').forEach(b=>{
        const uid = parseInt(b.getAttribute('data-uid'),10);
        b.removeEventListener('click', ()=>removeGid(uid));
        b.addEventListener('click', ()=>removeGid(uid));
      });
      document.querySelectorAll('[id^="total-input-"]').forEach(inp=>{
        const uid = parseInt(inp.id.replace('total-input-',''),10);
        inp.removeEventListener('input', ()=>validarTeto(uid,'teto'));
        inp.addEventListener('input', ()=>validarTeto(uid,'teto'));
      });
      document.querySelectorAll('[id^="sup-"]').forEach(inp=>{
        const m = inp.id.match(/^sup-(\d+)-\d+$/);
        if (m) {
          const uid = parseInt(m[1],10);
          inp.removeEventListener('input', ()=>validarTeto(uid,'mes'));
          inp.addEventListener('input', ()=>validarTeto(uid,'mes'));
        }
      });

      buildResumo();
      checkFormBlockState();
    } catch (e) {
      console.warn('restoreDraft falhou', e);
    }
  }

  // ---------- EVENT DELEGATION PARA BOTÕES GLOBAIS ----------
  function setupGlobalHandlers(){
    const btnAddSupl = document.getElementById('btnAddSupl');
    if (btnAddSupl) btnAddSupl.addEventListener('click', ()=>addSupl());

    const btnAddRemaj = document.getElementById('btnAddRemaj');
    if (btnAddRemaj) btnAddRemaj.addEventListener('click', ()=>addRemaj());

    document.addEventListener('click', function(e){
      const target = e.target;
      if (!target) return;
      const action = target.getAttribute && target.getAttribute('data-action');
      if (!action) return;
      if (action === 'remove-block'){
        const block = target.getAttribute('data-block');
        if (block) removeBlockById(block);
      }
    });

    const btnClearDraft = document.getElementById('btnClearDraft');
    if (btnClearDraft) btnClearDraft.addEventListener('click', ()=>{ if (confirm('Limpar rascunho? Esta ação é irreversível.')) clearDraft(); });

    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.addEventListener('change', handleFileInput);
  }

  // Inicialização quando a página carrega
  function init(){
    setupGlobalHandlers();
    restoreDraft();
    buildResumo();
    document.addEventListener('input', function(){ saveDraft(); }, {capture:true});
  }

  // Expor algumas funções globalmente (para uso inline original e testes)
  window.selectTipo = selectTipo;
  window.resetForm = resetForm;
  window.addSupl = addSupl;
  window.addRemaj = addRemaj;
  window.distribuirIgual = distribuirIgual;
  window.validarTeto = validarTeto;
  window.distribuirIgualCalc = distribuirIgualCalc;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { distribuirIgualCalc };
  }
})(window);
