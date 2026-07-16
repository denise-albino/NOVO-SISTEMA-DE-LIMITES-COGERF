// Limites - refactor (2026-07-07) - remanejamento 1→N, N→1, 1→1 + conclusão
// Substitui e amplia a lógica de remanejamento: múltiplas pernas por remanejamento,
// balanceamento (origens == destinos), validações e handler de envio (Concluir Solicitação).

(function(window){
  const MONTHS_SHORT=['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
  const GIDS=['PASSAGENS E DIÁRIAS','SERVIÇOS DE TERCEIROS PJ','MATERIAL DE CONSUMO'];
  const MAPPS=[
    {v:'3',l:'3 - Manutenção das Unidades de Internação',t:'MANUTENÇÃO'},
    {v:'5',l:'5 - Gestão e Manutenção de Serviços',t:'GESTÃO'},
    {v:'12',l:'12 - Fortalecimento da Assistência Social',t:'FINALÍSTICO'}
  ];

  const mappOpts = '<option value="">Selecione...</option>' + MAPPS.map(m=>`<option value="${m.v}" data-tipo="${m.t}">${m.l}</option>`).join('');
  const gidOpts = GIDS.map(g=>`<option>${g}</option>`).join('');

  let currentTipo=null, suplCount=0, remajCount=0, gidUid=0;
  const STORAGE_KEY = 'limites_solicitacao_draft_v1';

  function distribuirIgualCalc(total){
    const totalCent = Math.round(Number(total) * 100);
    if (!isFinite(totalCent) || totalCent <= 0) return Array(12).fill(0);
    const baseCent = Math.floor(totalCent/12);
    let resto = totalCent - baseCent*12;
    const arr = Array(12).fill(baseCent);
    for (let i=11; resto>0 && i>=0; i--, resto--) arr[i] += 1;
    return arr.map(c => c/100);
  }

  function findMaxUid(){
    const nodes = Array.from(document.querySelectorAll('[id^="sup-"]'));
    let max=-1; nodes.forEach(n=>{const m=n.id.match(/^sup-(\d+)-\d+$/); if(m){const v=parseInt(m[1],10); if(v>max) max=v;}}); return max;
  }

  // ---------- builders ----------
  function buildDuodForGid(gidUidVal, labelVerb){
    const verb = labelVerb || (currentTipo==='suplementacao'?'Suplementar':'Remanejar');
    const uid = gidUidVal;
    let html = `<div class="duod-wrap" data-uid="${uid}">`+
      `<div class="duod-header-actions">`+
        `<div class="duod-label">Distribuição mensal — A ${verb}</div>`+
        `<div class="auto-dist-box">`+
          `<input type="number" id="total-input-${uid}" placeholder="Valor Total Teto (R$)" min="0" step="0.01">`+
          `<button type="button" class="btn-action-small" data-action="distribuir" data-uid="${uid}">Distribuir igualmente</button>`+
          `<button type="button" class="btn-action-small" data-action="remove-gid" data-uid="${uid}" style="background:#fff;border:1px solid #ddd;color:#c0392b;margin-left:8px;">Remover</button>`+
        `</div>`+
      `</div>`+
      `<div class="dgrid">`;

    MONTHS_SHORT.forEach((m,i)=>{
      html += `<div class="dm"><div class="dm-head">${m}</div><div class="dm-body">`+
        `<div class="df"><div class="dfl">Atual</div><input type="text" readonly placeholder="R$ 0,00"></div>`+
        `<div class="df"><div class="dfl">Valor</div><input type="number" id="sup-${uid}-${i}" placeholder="0,00" min="0" step="0.01"></div>`+
      `</div></div>`;
    });

    html += `</div><div class="error-msg-box" id="error-${uid}">⚠️ A soma distribuída nos meses não pode ultrapassar o valor total definido.</div></div>`;
    return html;
  }

  // ---------- handlers/validators ----------
  function validarTeto(uid){
    const inputTeto = document.getElementById(`total-input-${uid}`);
    const errorBox = document.getElementById(`error-${uid}`);
    const blockWrapper = inputTeto ? (inputTeto.closest('.gid-block') || inputTeto.closest('.item-block')) : null;
    if(!inputTeto) return;
    const tetoMax = parseFloat(inputTeto.value) || 0;
    let somaMeses = 0;
    for(let i=0;i<12;i++){ const el = document.getElementById(`sup-${uid}-${i}`); if(el) somaMeses += parseFloat(el.value) || 0; }

    // clear when empty
    if(tetoMax <= 0 && somaMeses === 0){ if(blockWrapper) blockWrapper.classList.remove('has-error'); if(errorBox) errorBox.style.display='none'; buildResumo(); saveDraft(); return; }

    if (Math.round(somaMeses*100) > Math.round(tetoMax*100)){
      if(blockWrapper) blockWrapper.classList.add('has-error'); if(errorBox){ errorBox.style.display='flex'; errorBox.textContent='⚠️ A soma dos meses ultrapassa o valor total definido.'; }
    } else if (Math.round(somaMeses*100) < Math.round(tetoMax*100)){
      // for remanejamento legs we allow partial until final balance check; but still flag as error on the leg
      if(blockWrapper) blockWrapper.classList.add('has-error'); if(errorBox){ errorBox.style.display='flex'; errorBox.textContent='⚠️ A soma dos meses é menor que o valor total.'; }
    } else {
      if(blockWrapper) blockWrapper.classList.remove('has-error'); if(errorBox) errorBox.style.display='none';
    }

    // if this gid belongs to a remanejamento, trigger balance check
    const gidBlock = inputTeto.closest('.gid-block');
    if(gidBlock && gidBlock.dataset.remajId) validarRemajBalance(gidBlock.dataset.remajId);

    buildResumo(); saveDraft(); updateSalvarState();
  }

  function validarRemajBalance(remajId){
    const container = document.getElementById(`remaj-block-${remajId}`);
    if(!container) return true;
    const origNodes = Array.from(container.querySelectorAll('#orig-'+remajId+' .gid-block'));
    const destNodes = Array.from(container.querySelectorAll('#dest-'+remajId+' .gid-block'));

    // sum totals by reading total-input-x inside each gid-block
    const sumFor = (nodes) => nodes.reduce((acc, gb)=>{ const inp = gb.querySelector('[id^="total-input-"]'); return acc + (inp? (parseFloat(inp.value)||0) : 0); }, 0);
    const sOrig = sumFor(origNodes), sDest = sumFor(destNodes);

    const errorElId = `remaj-error-${remajId}`;
    let errorEl = document.getElementById(errorElId);
    if(!errorEl){ errorEl = document.createElement('div'); errorEl.id = errorElId; errorEl.className='error-msg-box'; container.querySelector('.item-block-body').prepend(errorEl); }

    // if both sides have some value, require equality
    if (Math.round(sOrig*100) === 0 && Math.round(sDest*100) === 0){ errorEl.style.display='none'; container.classList.remove('has-error'); return true; }
    if (Math.round(sOrig*100) !== Math.round(sDest*100)){
      errorEl.textContent = '⚠️ Totais de ORIGEM e DESTINO do remanejamento devem ser iguais.'; errorEl.style.display='flex'; container.classList.add('has-error'); return false;
    }
    errorEl.style.display='none'; container.classList.remove('has-error'); return true;
  }

  function updateSalvarState(){
    const btn = document.getElementById('btnSalvar'); if(!btn) return;
    const hasErrors = document.querySelectorAll('.has-error').length > 0;
    const hasGid = document.querySelectorAll('.gid-block').length > 0;
    const justific = document.getElementById('justificativa') ? document.getElementById('justificativa').value.trim() : '';
    btn.disabled = hasErrors || !hasGid || justific.length===0 || !document.getElementById('selectFonte') || !document.getElementById('selectFonte').value;
  }

  function distribuirIgual(uid){
    const totalInput = document.getElementById(`total-input-${uid}`);
    const totalVal = parseFloat(totalInput && totalInput.value) || 0; if(totalVal<=0) return;
    const arr = distribuirIgualCalc(totalVal);
    for(let i=0;i<12;i++){ const inMes = document.getElementById(`sup-${uid}-${i}`); if(inMes) inMes.value = arr[i].toFixed(2); }
    validarTeto(uid);
  }

  // ---------- suplementação ----------
  function addSupl(){
    const id = suplCount++; const div = document.createElement('div'); div.className='item-block'; div.id = 'supl-block-'+id;
    div.innerHTML = `
      <div class="item-block-head">
        <div class="item-block-num"><span class="num-badge">${id+1}</span> MAPP</div>
        <div style="display:flex;gap:8px;align-items:center;"><button type="button" class="btn-action-small" data-action="remove-block" data-block="supl-block-${id}" style="background:#fff;border:1px solid #ddd;color:#c0392b;">Remover MAPP</button></div>
      </div>
      <div class="item-block-body">
        <div class="frow"><div class="fg"><label class="fl req">MAPP</label><select>${mappOpts}</select></div></div>
        <div id="gids-supl-${id}"></div>
      </div>`;
    const cont = document.getElementById('suplBlocks'); if(cont) cont.appendChild(div);
    addGidToSupl(id); saveDraft(); updateSalvarState();
  }
  function addGidToSupl(suplId){ const uid = gidUid++; const div = document.createElement('div'); div.className='gid-block';
    div.innerHTML = `<div class="gid-block-body"><div class="frow"><div class="fg"><label class="fl req">GID</label><select>${gidOpts}</select></div></div></div>${buildDuodForGid(uid)}`;
    const parent = document.getElementById('gids-supl-'+suplId); if(parent) parent.appendChild(div);
    // associate mapp dataset from parent select
    const parentItem = document.getElementById('supl-block-'+suplId); const parentMapp = parentItem ? parentItem.querySelector('select') : null;
    if(parentMapp) div.dataset.mapp = parentMapp.value;
    // attach handlers
    reattachHandlersForUid(uid);
  }

  // ---------- remanejamento (multi-legs) ----------
  function addRemaj(){
    const id = remajCount++; const div = document.createElement('div'); div.className='item-block'; div.id='remaj-block-'+id;
    div.innerHTML = `
      <div class="item-block-head">
        <div class="item-block-num"><span class="num-badge">${id+1}</span> Remanejamento</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button type="button" class="btn-action-small" data-action="remove-block" data-block="remaj-block-${id}" style="background:#fff;border:1px solid #ddd;color:#c0392b;">Remover Remanejamento</button>
        </div>
      </div>
      <div class="item-block-body">
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:8px;">
          <div style="flex:1;display:flex;align-items:center;gap:8px;"><strong>Origem</strong><button type="button" class="btn-action-small" data-action="add-remaj-leg" data-remaj="${id}" data-role="orig">＋ Perna</button></div>
          <div style="flex:1;display:flex;align-items:center;gap:8px;"><strong>Destino</strong><button type="button" class="btn-action-small" data-action="add-remaj-leg" data-remaj="${id}" data-role="dest">＋ Perna</button></div>
        </div>
        <div class="remaj-group">
          <div class="remaj-group-head origem"><span class="remaj-group-title">📤 Origem (Redução)</span></div>
          <div class="remaj-group-body" id="orig-${id}"></div>
        </div>
        <div class="remaj-group">
          <div class="remaj-group-head destino"><span class="remaj-group-title">📥 Destino (Acréscimo)</span></div>
          <div class="remaj-group-body" id="dest-${id}"></div>
        </div>
      </div>`;
    const cont = document.getElementById('remajBlocks'); if(cont) cont.appendChild(div);
    // add one initial leg on each side
    addRemajLeg(`orig-${id}`,'orig', id);
    addRemajLeg(`dest-${id}`,'dest', id);
    saveDraft(); updateSalvarState();
  }

  function addRemajLeg(containerId, tipo, remajId){
    const uid = gidUid++;
    const div = document.createElement('div');
    div.className = 'gid-block';
    div.dataset.remajId = typeof remajId !== 'undefined' ? String(remajId) : (containerId.split('-')[1]||'');
    div.dataset.role = tipo; // 'orig' or 'dest'
    div.innerHTML = `
      <div class="gid-block-body">
        <div class="frow">
          <div class="fg"><label class="fl req">MAPP</label><select>${mappOpts}</select></div>
          <div class="fg"><label class="fl req">GID</label><select>${gidOpts}</select></div>
        </div>
      </div>
      ${buildDuodForGid(uid, tipo==='orig'?'Reduzir':'Acrescentar')}`;

    const container = document.getElementById(containerId);
    if(container) container.appendChild(div);

    // when mapp select changes update dataset
    const mappSelect = div.querySelector('select');
    if(mappSelect){ mappSelect.addEventListener('change', ()=>{ div.dataset.mapp = mappSelect.value; buildResumo(); saveDraft(); }); }
    reattachHandlersForUid(uid);
  }

  // ---------- handlers for new elements ----------
  function reattachHandlersForUid(uid){
    // distribuir, remove-gid, month inputs, total-input binding
    const btnDistribuir = document.querySelector(`[data-action="distribuir"][data-uid="${uid}"]`);
    if(btnDistribuir){ btnDistribuir.removeEventListener('click', distribuirIgualBound); btnDistribuir.addEventListener('click', distribuirIgualBound); }
    const btnRemove = document.querySelector(`[data-action="remove-gid"][data-uid="${uid}"]`);
    if(btnRemove){ btnRemove.removeEventListener('click', removeGidBound); btnRemove.addEventListener('click', removeGidBound); }

    for(let i=0;i<12;i++){ const inp = document.getElementById(`sup-${uid}-${i}`); if(inp){ inp.removeEventListener('input', validarTetoBound); inp.addEventListener('input', validarTetoBound); } }
    const total = document.getElementById(`total-input-${uid}`); if(total){ total.removeEventListener('input', validarTetoBound); total.addEventListener('input', validarTetoBound); }
  }

  // bound wrappers to keep references for removeEventListener
  function distribuirIgualBound(e){ const uid = parseInt(e.currentTarget.getAttribute('data-uid'),10); distribuirIgual(uid); }
  function removeGidBound(e){ const uid = parseInt(e.currentTarget.getAttribute('data-uid'),10); removeGid(uid); }
  function validarTetoBound(e){ const id = e.currentTarget.id.match(/^total-input-(\d+)$/) || e.currentTarget.id.match(/^sup-(\d+)-\d+$/); const uid = id ? parseInt(id[1],10) : null; if(uid!=null) validarTeto(uid); }

  function removeGid(uid){ const wrap = document.querySelector(`.duod-wrap[data-uid="${uid}"]`); if(!wrap) return; const gidBlock = wrap.closest('.gid-block'); if(gidBlock) gidBlock.remove(); buildResumo(); saveDraft(); updateSalvarState(); }

  // ---------- resumo e submissão ----------
  const base = {
    MANUTENÇÃO:[{mapp:'3',desc:'Manutenção Unidades',gid:'SERVIÇOS PJ',deliberado:1240000,revisado:1240000}],
    FINALÍSTICO:[{mapp:'12',desc:'Fortalecimento Social',gid:'MATERIAL CONSUMO',deliberado:650000,revisado:650000}],
    GESTÃO:[{mapp:'5',desc:'Gestão e Manutenção',gid:'DIÁRIAS',deliberado:320000,revisado:320000}]
  };
  function fmt(v){ return 'R$ '+v.toLocaleString('pt-BR',{minimumFractionDigits:2}); }

  function buildResumo(){
    const body = document.getElementById('resumoBody'); if(!body) return; body.innerHTML='';

    // collect adjustments grouped by mapp
    const adjustments = {}; // mapp -> valor
    document.querySelectorAll('.gid-block').forEach(gb=>{
      const mapp = gb.dataset.mapp || (gb.querySelector('select') ? gb.querySelector('select').value : '');
      if(!mapp) return;
      // sum months for that gid-block
      let soma=0; gb.querySelectorAll('[id^="sup-"]').forEach(inp=>{ soma += parseFloat(inp.value) || 0; });
      // sign: suplementacao +, remanejamento origin - , remanejamento dest +
      let sign = 1;
      if (gb.dataset.remajId){ sign = (gb.dataset.role === 'orig') ? -1 : 1; }
      adjustments[mapp] = (adjustments[mapp] || 0) + (sign * soma);
    });

    const categories = ['MANUTENÇÃO','FINALÍSTICO','GESTÃO'];
    let totalD=0, totalR=0;
    categories.forEach(cat=>{
      const trCat = document.createElement('tr'); trCat.className='cat-hd'; trCat.innerHTML=`<td colspan="5">▾ MAPP ${cat}</td>`; body.appendChild(trCat);
      base[cat].forEach(r=>{
        const adj = adjustments[r.mapp] || 0; const revised = r.deliberado + adj;
        const tr = document.createElement('tr'); tr.innerHTML = `<td>MAPP ${r.mapp} - ${r.gid}</td><td>${fmt(r.deliberado)}</td><td>${fmt(revised)}</td><td>${fmt(revised - r.deliberado)}</td><td>100%</td>`;
        body.appendChild(tr);
        totalD += r.deliberado; totalR += revised;
      });
    });

    const trG = document.createElement('tr'); trG.className='grand-row'; trG.innerHTML = `<td>TOTAL GERAL</td><td>${fmt(totalD)}</td><td>${fmt(totalR)}</td><td>${fmt(totalR-totalD)}</td><td>-</td>`; body.appendChild(trG);

    updateSalvarState();
  }

  function finalValidation(){
    // ensure no .has-error, fonte selected, justificativa filled, and remaj groups balanced
    const fonte = document.getElementById('selectFonte'); if(!fonte || !fonte.value) return {ok:false,msg:'Selecione a Fonte.'};
    const just = document.getElementById('justificativa'); if(!just || !just.value.trim()) return {ok:false,msg:'Preencha a Justificativa.'};
    if(document.querySelectorAll('.has-error').length>0) return {ok:false,msg:'Existem erros nos blocos. Corrija-os antes de prosseguir.'};
    // verify each remaj block balanced
    let allBalanced = true; document.querySelectorAll('.item-block[id^="remaj-block-"]').forEach(rb=>{ const id = rb.id.replace('remaj-block-',''); if(!validarRemajBalance(id)) allBalanced = false; });
    if(!allBalanced) return {ok:false,msg:'Remanejamentos sem balanceamento: verifique origens/destinos.'};
    // OK
    return {ok:true};
  }

  function onSubmit(){
    const v = finalValidation(); if(!v.ok){ alert(v.msg); return; }
    // build payload (summary)
    const payload = { tipo: currentTipo, fonte: document.getElementById('selectFonte').value, justificativa: document.getElementById('justificativa').value, attachments: [] };
    // collect remanejamentos and suplementacoes
    payload.suplementacoes = [];
    document.querySelectorAll('#suplBlocks .item-block').forEach(block=>{
      const mapp = block.querySelector('select') ? block.querySelector('select').value : ''; const gids = [];
      block.querySelectorAll('.gid-block').forEach(gb=>{ const gid = (gb.querySelector('select') ? gb.querySelectorAll('select')[1] : null); // in supl, first select is GID only
        // gather monthly values
        const uidNode = gb.querySelector('.duod-wrap'); const uid = uidNode ? uidNode.getAttribute('data-uid') : null; const months=[]; if(uid){ for(let i=0;i<12;i++){ const v = document.getElementById(`sup-${uid}-${i}`); months.push(v?parseFloat(v.value)||0:0); }}
        gids.push({mapp:mapp, months});
      });
      payload.suplementacoes.push({mapp:mapp,gids});
    });
    // remanejamentos
    payload.remanejamentos = [];
    document.querySelectorAll('#remajBlocks .item-block').forEach(rb=>{
      const remajId = rb.id.replace('remaj-block-',''); const rem = {id:remajId, orig:[], dest:[]};
      rb.querySelectorAll('.remaj-group-body#orig-'+remajId+' .gid-block, .remaj-group-body#dest-'+remajId+' .gid-block').forEach(gb=>{
        const role = gb.dataset.role || (gb.closest('#orig-'+remajId)?'orig':'dest'); const mapp = gb.querySelector('select') ? gb.querySelectorAll('select')[0].value : '';
        const uidNode = gb.querySelector('.duod-wrap'); const uid = uidNode ? uidNode.getAttribute('data-uid') : null; const total = uid ? (parseFloat(document.getElementById(`total-input-${uid}`).value)||0) : 0;
        const obj = {mapp, total}; if(role==='orig') rem.orig.push(obj); else rem.dest.push(obj);
      });
      payload.remanejamentos.push(rem);
    });

    // simulate submit
    console.log('SUBMIT payload', payload);
    alert('Solicitação concluída com sucesso (simulação). Verifique console para payload.');
    // clear draft and reset
    clearDraft(); resetForm();
  }

  // ---------- persistence ----------
  function saveDraft(){ try{ const state = { currentTipo: currentTipo, suplHtml: document.getElementById('suplBlocks')?document.getElementById('suplBlocks').innerHTML:'', remajHtml: document.getElementById('remajBlocks')?document.getElementById('remajBlocks').innerHTML:'', justificativa: (document.getElementById('justificativa')&&document.getElementById('justificativa').value)||'', fonte: (document.getElementById('selectFonte')&&document.getElementById('selectFonte').value)||'', attachments: (JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}').attachments||[]) }; localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){console.warn('saveDraft falhou',e);} }
  function clearDraft(){ localStorage.removeItem(STORAGE_KEY); const supr=document.getElementById('suplBlocks'); if(supr) supr.innerHTML=''; const rem=document.getElementById('remajBlocks'); if(rem) rem.innerHTML=''; const just=document.getElementById('justificativa'); if(just) just.value=''; const fonte=document.getElementById('selectFonte'); if(fonte) fonte.value=''; const attachments=document.getElementById('attachmentsList'); if(attachments) attachments.innerHTML=''; const fileInput=document.getElementById('fileInput'); if(fileInput) fileInput.value=''; suplCount=0; remajCount=0; gidUid=0; saveDraft(); buildResumo(); updateSalvarState(); }

  function restoreDraft(){ try{ const raw = localStorage.getItem(STORAGE_KEY); if(!raw) return; const state = JSON.parse(raw); if(state.currentTipo){ currentTipo = state.currentTipo; document.getElementById('stepSel').classList.add('hidden'); document.getElementById('mainForm').classList.remove('hidden'); document.getElementById('tipoBadge').textContent = currentTipo.toUpperCase(); if(currentTipo==='suplementacao'){ document.getElementById('suplementacaoSection').classList.remove('hidden'); document.getElementById('remanejamentoSection').classList.add('hidden'); } else { document.getElementById('remanejamentoSection').classList.remove('hidden'); document.getElementById('suplementacaoSection').classList.add('hidden'); } }
    if(state.suplHtml && document.getElementById('suplBlocks')) document.getElementById('suplBlocks').innerHTML = state.suplHtml;
    if(state.remajHtml && document.getElementById('remajBlocks')) document.getElementById('remajBlocks').innerHTML = state.remajHtml;
    if(state.justificativa && document.getElementById('justificativa')) document.getElementById('justificativa').value = state.justificativa;
    if(state.fonte && document.getElementById('selectFonte')) document.getElementById('selectFonte').value = state.fonte;
    // reattach handlers
    const maxUid = findMaxUid(); gidUid = Math.max(gidUid, maxUid+1);
    suplCount = document.querySelectorAll('#suplBlocks .item-block').length; remajCount = document.querySelectorAll('#remajBlocks .item-block').length;
    // attach distribution/remove handlers
    document.querySelectorAll('[data-action="distribuir"]').forEach(b=>{ b.addEventListener('click', distribuirIgualBound); });
    document.querySelectorAll('[data-action="remove-gid"]').forEach(b=>{ b.addEventListener('click', removeGidBound); });
    document.querySelectorAll('[id^="total-input-"]').forEach(inp=>{ inp.addEventListener('input', validarTetoBound); });
    document.querySelectorAll('[id^="sup-"]').forEach(inp=>{ inp.addEventListener('input', validarTetoBound); });
    buildResumo(); updateSalvarState(); }catch(e){ console.warn('restoreDraft',e);} }

  // ---------- global handlers ----------
  function setupGlobal(){
    const btnAddSupl = document.getElementById('btnAddSupl'); if(btnAddSupl) btnAddSupl.addEventListener('click', addSupl);
    const btnAddRemaj = document.getElementById('btnAddRemaj'); if(btnAddRemaj) btnAddRemaj.addEventListener('click', addRemaj);
    document.addEventListener('click', function(e){ const t=e.target; if(!t) return; const action = t.getAttribute && t.getAttribute('data-action'); if(!action) return; if(action==='remove-block'){ const b=t.getAttribute('data-block'); if(b) removeBlockById(b); } if(action==='add-remaj-leg'){ const remaj = t.getAttribute('data-remaj'); const role = t.getAttribute('data-role'); if(remaj && role){ addRemajLeg((role==='orig'?'orig-':'dest-')+remaj, role, parseInt(remaj,10)); } } });
    const btnClearDraft = document.getElementById('btnClearDraft'); if(btnClearDraft) btnClearDraft.addEventListener('click', ()=>{ if(confirm('Limpar rascunho? Esta ação é irreversível.')) clearDraft(); });
    const fileInput = document.getElementById('fileInput'); if(fileInput) fileInput.addEventListener('change', function(e){ const files = Array.from(e.target.files || []); const names = files.map(f=>f.name); const el = document.getElementById('attachmentsList'); if(el) el.innerHTML = names.map(n=>`<div style="padding:6px 0">📎 ${n}</div>`).join(''); try{ const st = JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'); st.attachments = names; localStorage.setItem(STORAGE_KEY, JSON.stringify(st)); }catch(e){} });
    const btnSalvar = document.getElementById('btnSalvar'); if(btnSalvar) btnSalvar.addEventListener('click', onSubmit);
    const just = document.getElementById('justificativa'); if(just) just.addEventListener('input', ()=>{ buildResumo(); saveDraft(); });
    const fonte = document.getElementById('selectFonte'); if(fonte) fonte.addEventListener('change', updateSalvarState);
  }

  function removeBlockById(id){ const el = document.getElementById(id); if(!el) return; el.remove(); saveDraft(); buildResumo(); updateSalvarState(); }

  // ---------- init ----------
  function init(){ setupGlobal(); restoreDraft(); buildResumo(); document.addEventListener('input', function(){ saveDraft(); }, {capture:true}); updateSalvarState(); }

  // expose for inline
  window.selectTipo = function(tipo){ currentTipo=tipo; document.getElementById('stepSel').classList.add('hidden'); document.getElementById('mainForm').classList.remove('hidden'); document.getElementById('tipoBadge').textContent = (tipo||'').toUpperCase(); if(tipo==='suplementacao'){ document.getElementById('suplementacaoSection').classList.remove('hidden'); document.getElementById('remanejamentoSection').classList.add('hidden'); document.getElementById('suplBlocks').innerHTML=''; suplCount=0; addSupl(); } else { document.getElementById('remanejamentoSection').classList.remove('hidden'); document.getElementById('suplementacaoSection').classList.add('hidden'); document.getElementById('remajBlocks').innerHTML=''; remajCount=0; addRemaj(); } updateSalvarState(); };
  window.resetForm = function(){ document.getElementById('mainForm').classList.add('hidden'); document.getElementById('stepSel').classList.remove('hidden'); };
  window.addSupl = addSupl; window.addRemaj = addRemaj; window.distribuirIgual = function(uid){ distribuirIgual(uid); };

  // helper wrappers used for addEventListener removeEventListener stable references
  window.distribuirIgualCalc = distribuirIgualCalc;
  function distribuirIgualBound(e){ const uid = parseInt(e.currentTarget.getAttribute('data-uid'),10); distribuirIgual(uid); }
  function removeGidBound(e){ const uid = parseInt(e.currentTarget.getAttribute('data-uid'),10); removeGid(uid); }
  function validarTetoBound(e){ const idm = e.currentTarget.id.match(/^total-input-(\d+)$/) || e.currentTarget.id.match(/^sup-(\d+)-\d+$/); if(idm){ validarTeto(parseInt(idm[1],10)); } }

  document.addEventListener('DOMContentLoaded', init);

  // export for tests
  if (typeof module !== 'undefined' && module.exports) { module.exports = { distribuirIgualCalc }; }

})(window);
