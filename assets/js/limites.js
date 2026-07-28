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
  const PREVIEW_KEY = 'limites_solicitacoes_preview_v1';

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
    let html = `<div class=\"duod-wrap\" data-uid=\"${uid}\">`+
      `<div class=\"duod-header-actions\">`+
        `<div class=\"duod-label\">Distribuição mensal — A ${verb}</div>`+
        `<div class=\"auto-dist-box\">`+
          `<input type=\"number\" id=\"total-input-${uid}\" placeholder=\"Valor Total Teto (R$)\" min=\"0\" step=\"0.01\">`+
          `<button type=\"button\" class=\"btn-action-small\" data-action=\"distribuir\" data-uid=\"${uid}\">Distribuir igualmente</button>`+
          `<button type=\"button\" class=\"btn-action-small\" data-action=\"remove-gid\" data-uid=\"${uid}\" style=\"background:#fff;border:1px solid #ddd;color:#c0392b;margin-left:8px;\">Remover</button>`+
        `</div>`+
      `</div>`+
      `<div class=\"dgrid\">`;

    MONTHS_SHORT.forEach((m,i)=>{
      html += `<div class=\"dm\"><div class=\"dm-head\">${m}</div><div class=\"dm-body\">`+
        `<div class=\"df\"><div class=\"dfl\">Atual</div><input type=\"text\" readonly placeholder=\"R$ 0,00\"></div>`+
        `<div class=\"df\"><div class=\"dfl\">Valor</div><input type=\"number\" id=\"sup-${uid}-${i}\" placeholder=\"0,00\" min=\"0\" step=\"0.01\"></div>`+
      `</div></div>`;
    });

    html += `</div><div class=\"error-msg-box\" id=\"error-${uid}\">⚠️ A soma distribuída nos meses não pode ultrapassar o valor total definido.</div></div>`;
    return html;
  }

  // ---------- helpers for UI normalization ----------
  function normalizeRemajButtons(){
    // Ensure each remaj block's Origem and Destino headers have an add button (migrate older rascunhos)
    document.querySelectorAll('.item-block[id^=\"remaj-block-\"]').forEach(rb=>{
      const id = rb.id.replace('remaj-block-','');
      const origHead = rb.querySelector('.remaj-group-head.origem');
      if(origHead && !origHead.querySelector('[data-action=\"add-remaj-leg\"]')){
        const btn = document.createElement('button');
        btn.type='button'; btn.className='btn-action-small'; btn.setAttribute('data-action','add-remaj-leg');
        btn.setAttribute('data-remaj',id); btn.setAttribute('data-role','orig'); btn.textContent='+remanejamento';
        origHead.appendChild(btn);
      }
      const destHead = rb.querySelector('.remaj-group-head.destino');
      if(destHead && !destHead.querySelector('[data-action=\"add-remaj-leg\"]')){
        const btn2 = document.createElement('button');
        btn2.type='button'; btn2.className='btn-action-small'; btn2.setAttribute('data-action','add-remaj-leg');
        btn2.setAttribute('data-remaj',id); btn2.setAttribute('data-role','dest'); btn2.textContent='+remanejamento';
        destHead.appendChild(btn2);
      }
    });
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
    const sumFor = (nodes) => nodes.reduce((acc, gb)=>{ const inp = gb.querySelector('[id^=\"total-input-\"]'); return acc + (inp? (parseFloat(inp.value)||0) : 0); }, 0);
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
      <div class=\"item-block-head\">\n        <div class=\"item-block-num\"><span class=\"num-badge\">${id+1}</span> MAPP</div>\n        <div style=\"display:flex;gap:8px;align-items:center;\"><button type=\"button\" class=\"btn-action-small\" data-action=\"remove-block\" data-block=\"supl-block-${id}\" style=\"background:#fff;border:1px solid #ddd;color:#c0392b;\">Remover MAPP</button></div>\n      </div>\n      <div class=\"item-block-body\">\n        <div class=\"frow\"><div class=\"fg\"><label class=\"fl req\">MAPP</label><select>${mappOpts}</select></div></div>\n        <div id=\"gids-supl-${id}\"></div>\n      </div>`;
    const cont = document.getElementById('suplBlocks'); if(cont) cont.appendChild(div);
    addGidToSupl(id); saveDraft(); updateSalvarState();
  }
  function addGidToSupl(suplId){ const uid = gidUid++; const div = document.createElement('div'); div.className='gid-block';
    div.innerHTML = `<div class=\"gid-block-body\"><div class=\"frow\"><div class=\"fg\"><label class=\"fl req\">GID</label><select>${gidOpts}</select></div></div></div>${buildDuodForGid(uid)}`;
    const parent = document.getElementById('gids-supl-'+suplId); if(parent) parent.appendChild(div);
    // associate mapp dataset from parent select
    const parentItem = document.getElementById('supl-block-'+suplId); const parentMapp = parentItem ? parentItem.querySelector('select') : null;
    if(parentMapp) div.dataset.mapp = parentMapp.value;
    // attach handlers
    reattachHandlersForUid(uid);
    // ensure state is saved and buttons update
    saveDraft(); updateSalvarState();
  }

  // ---------- remanejamento (multi-legs) ----------
  function addRemaj(){
    const id = remajCount++; const div = document.createElement('div'); div.className='item-block'; div.id='remaj-block-'+id;
    div.innerHTML = `
      <div class=\"item-block-head\">\n        <div class=\"item-block-num\"><span class=\"num-badge\">${id+1}</span> Remanejamento</div>\n        <div style=\"display:flex;gap:8px;align-items:center;\">\n          <button type=\"button\" class=\"btn-action-small\" data-action=\"remove-block\" data-block=\"remaj-block-${id}\" style=\"background:#fff;border:1px solid #ddd;color:#c0392b;\">Remover Remanejamento</button>\n        </div>\n      </div>\n      <div class=\"item-block-body\">\n        <div class=\"remaj-group\">\n          <div class=\"remaj-group-head origem\"><span class=\"remaj-group-title\">📤 Origem (Redução)</span> <button type=\"button\" class=\"btn-action-small\" data-action=\"add-remaj-leg\" data-remaj=\"${id}\" data-role=\"orig\">+remanejamento</button></div>\n          <div class=\"remaj-group-body\" id=\"orig-${id}\"></div>\n        </div>\n        <div class=\"remaj-group\">\n          <div class=\"remaj-group-head destino\"><span class=\"remaj-group-title\">📥 Destino (Acréscimo)</span> <button type=\"button\" class=\"btn-action-small\" data-action=\"add-remaj-leg\" data-remaj=\"${id}\" data-role=\"dest\">+remanejamento</button></div>\n          <div class=\"remaj-group-body\" id=\"dest-${id}\"></div>\n        </div>\n      </div>`;
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
      <div class=\"gid-block-body\">\n        <div class=\"frow\">\n          <div class=\"fg\"><label class=\"fl req\">MAPP</label><select>${mappOpts}</select></div>\n          <div class=\"fg\"><label class=\"fl req\">GID</label><select>${gidOpts}</select></div>\n        </div>\n      </div>\n      ${buildDuodForGid(uid, tipo==='orig'?'Reduzir':'Acrescentar')}`;

    const container = document.getElementById(containerId);
    if(container) container.appendChild(div);

    // when mapp select changes update dataset
    const selects = div.querySelectorAll('select');
    if(selects && selects[0]){ selects[0].addEventListener('change', ()=>{ div.dataset.mapp = selects[0].value; buildResumo(); saveDraft(); }); }
    reattachHandlersForUid(uid);
    // ensure state saved and UI updated
    saveDraft(); updateSalvarState();
  }

  // ---------- handlers for new elements ----------
  function reattachHandlersForUid(uid){
    // distribuir, remove-gid, month inputs, total-input binding
    const btnDistribuir = document.querySelector(`[data-action=\"distribuir\"][data-uid=\"${uid}\"]`);
    if(btnDistribuir){ btnDistribuir.removeEventListener('click', distribuirIgualBound); btnDistribuir.addEventListener('click', distribuirIgualBound); }
    const btnRemove = document.querySelector(`[data-action=\"remove-gid\"][data-uid=\"${uid}\"]`);
    if(btnRemove){ btnRemove.removeEventListener('click', removeGidBound); btnRemove.addEventListener('click', removeGidBound); }

    for(let i=0;i<12;i++){ const inp = document.getElementById(`sup-${uid}-${i}`); if(inp){ inp.removeEventListener('input', validarTetoBound); inp.addEventListener('input', validarTetoBound); } }
    const total = document.getElementById(`total-input-${uid}`); if(total){ total.removeEventListener('input', validarTetoBound); total.addEventListener('input', validarTetoBound); }
  }

  // ---------- remaining code (modified onSubmit to render preview table) ----------
  function distribuirIgualBound(e){ const uid = parseInt(e.currentTarget.getAttribute('data-uid'),10); distribuirIgual(uid); }
  function removeGidBound(e){ const uid = parseInt(e.currentTarget.getAttribute('data-uid'),10); removeGid(uid); }
  function validarTetoBound(e){ const idm = e.currentTarget.id.match(/^total-input-(\d+)$/) || e.currentTarget.id.match(/^sup-(\d+)-\d+$/); if(idm){ validarTeto(parseInt(idm[1],10)); } }

  function removeGid(uid){ const wrap = document.querySelector(`.duod-wrap[data-uid=\"${uid}\"]`); if(!wrap) return; const gidBlock = wrap.closest('.gid-block'); if(gidBlock) gidBlock.remove(); buildResumo(); saveDraft(); updateSalvarState(); }

  // ---------- resumo e submissão (new preview behavior) ----------
  const base = {
    MANUTENÇÃO:[{mapp:'3',desc:'Manutenção Unidades',gid:'SERVIÇOS PJ',deliberado:1240000,revisado:1240000}],
    FINALÍSTICO:[{mapp:'12',desc:'Fortalecimento Social',gid:'MATERIAL CONSUMO',deliberado:650000,revisado:650000}],
    GESTÃO:[{mapp:'5',desc:'Gestão e Manutenção',gid:'DIÁRIAS',deliberado:320000,revisado:320000}]
  };
  function fmt(v){ return 'R$ '+(Number(v)||0).toLocaleString('pt-BR',{minimumFractionDigits:2}); }

  function buildResumo(){
    const body = document.getElementById('resumoBody'); if(!body) return; body.innerHTML='';

    // collect adjustments grouped by mapp
    const adjustments = {}; // mapp -> valor
    document.querySelectorAll('.gid-block').forEach(gb=>{
      const mapp = gb.dataset.mapp || (gb.querySelector('select') ? gb.querySelector('select').value : '');
      if(!mapp) return;
      // sum months for that gid-block
      let soma=0; gb.querySelectorAll('[id^=\"sup-\"]').forEach(inp=>{ soma += parseFloat(inp.value) || 0; });
      // sign: suplementacao +, remanejamento origin - , remanejamento dest +
      let sign = 1;
      if (gb.dataset.remajId){ sign = (gb.dataset.role === 'orig') ? -1 : 1; }
      adjustments[mapp] = (adjustments[mapp] || 0) + (sign * soma);
    });

    const categories = ['MANUTENÇÃO','FINALÍSTICO','GESTÃO'];
    let totalD=0, totalR=0;
    categories.forEach(cat=>{
      const trCat = document.createElement('tr'); trCat.className='cat-hd'; trCat.innerHTML=`<td colspan=\"5\">▾ MAPP ${cat}</td>`; body.appendChild(trCat);
      base[cat].forEach(r=>{
        const adj = adjustments[r.mapp] || 0; const revised = r.deliberado + adj;
        const tr = document.createElement('tr'); tr.innerHTML = `<td>MAPP ${r.mapp} - ${r.gid}</td><td>${fmt(r.deliberado)}</td><td>${fmt(revised)}</td><td>${fmt(revised - r.deliberado)}</td><td> - </td>`;
        body.appendChild(tr);
        totalD += r.deliberado; totalR += revised;
      });
    });

    const trG = document.createElement('tr'); trG.className='grand-row'; trG.innerHTML = `<td>TOTAL GERAL</td><td>${fmt(totalD)}</td><td>${fmt(totalR)}</td><td>${fmt(totalR-totalD)}</td><td>-</td>`;
    body.appendChild(trG);

    updateSalvarState();
  }

  function finalValidation(){
    // ensure no .has-error, fonte selected, justificativa filled, and remaj groups balanced
    const fonte = document.getElementById('selectFonte'); if(!fonte || !fonte.value) return {ok:false,msg:'Selecione a Fonte.'};
    const just = document.getElementById('justificativa'); if(!just || !just.value.trim()) return {ok:false,msg:'Preencha a Justificativa.'};
    if(document.querySelectorAll('.has-error').length>0) return {ok:false,msg:'Existem erros nos blocos. Corrija-os antes de prosseguir.'};
    // verify each remaj block balanced
    let allBalanced = true; document.querySelectorAll('.item-block[id^=\"remaj-block-\"]').forEach(rb=>{ const id = rb.id.replace('remaj-block-',''); if(!validarRemajBalance(id)) allBalanced = false; });
    if(!allBalanced) return {ok:false,msg:'Remanejamentos sem balanceamento: verifique origens/destinos.'};
    // OK
    return {ok:true};
  }

  // New onSubmit: build a preview table (no backend). Stores preview in localStorage and renders a table like the image.
  function onSubmit(){
    const v = finalValidation(); if(!v.ok){ alert(v.msg); return; }

    // build header/payload
    const solicitacao = {
      tipo: currentTipo,
      fonte: document.getElementById('selectFonte').value,
      justificativa: document.getElementById('justificativa').value,
      attachments: (function(){ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}').attachments || []; }catch(e){return [];}})(),
      createdAt: new Date().toISOString()
    };

    const registros = [];

    // suplementacoes
    document.querySelectorAll('#suplBlocks .item-block').forEach(block=>{
      const orgao = block.querySelector('.item-block-num') ? block.querySelector('.item-block-num').textContent.trim() : '';
      block.querySelectorAll('.gid-block').forEach(gb=>{
        const gidSel = gb.querySelectorAll('select');
        const gid = gidSel && gidSel[0] ? gidSel[0].value || gidSel[0].textContent.trim() : '';
        const uidNode = gb.querySelector('.duod-wrap'); const uid = uidNode ? uidNode.getAttribute('data-uid') : null;
        let soma=0;
        if(uid){ for(let i=0;i<12;i++){ const m = document.getElementById(`sup-${uid}-${i}`); soma += (m?parseFloat(m.value)||0:0); }}
        registros.push({
          id: Date.now() + Math.floor(Math.random()*1000),
          orgao,
          gids: gid,
          fonte: solicitacao.fonte,
          nup: null,
          data_movimentacao: new Date().toISOString().slice(0,10),
          valor_deliberado: 0,
          valor_pedido: soma,
          valor_revisado: 0 + soma,
          tipo: 'suplementacao'
        });
      });
    });

    // remanejamentos
    document.querySelectorAll('#remajBlocks .item-block').forEach(rb=>{
      const remajId = rb.id.replace('remaj-block-','');
      rb.querySelectorAll('.remaj-group-body .gid-block').forEach(gb=>{
        const selects = gb.querySelectorAll('select');
        const mapp = selects && selects[0] ? selects[0].value : '';
        const gid = selects && selects[1] ? selects[1].value : '';
        const uidNode = gb.querySelector('.duod-wrap'); const uid = uidNode ? uidNode.getAttribute('data-uid') : null;
        let soma=0; if(uid){ for(let i=0;i<12;i++){ const m = document.getElementById(`sup-${uid}-${i}`); soma += (m?parseFloat(m.value)||0:0); }}
        const role = gb.dataset.role || null;
        const valorPedido = (role === 'orig') ? -soma : soma;
        registros.push({
          id: Date.now() + Math.floor(Math.random()*1000),
          orgao: mapp || '',
          gids: gid || '',
          fonte: solicitacao.fonte,
          nup: null,
          data_movimentacao: new Date().toISOString().slice(0,10),
          valor_deliberado: 0,
          valor_pedido: valorPedido,
          valor_revisado: 0 + valorPedido,
          tipo: 'remanejamento',
          remajId,
          role
        });
      });
    });

    // save preview into localStorage so it persists across reloads
    try{ localStorage.setItem(PREVIEW_KEY, JSON.stringify({ solicitacao, registros })); }catch(e){ console.warn('Não foi possível salvar preview', e); }

    // render preview table
    renderPreviewTable(registros);
    // optionally clear draft
    // clearDraft(); resetForm();
    alert('Solicitação concluída (preview). A tabela abaixo mostra os registros gerados.');
  }

  function renderPreviewTable(registros){
    // create container if not exists
    let cont = document.getElementById('previewTableContainer');
    if(!cont){ cont = document.createElement('div'); cont.id = 'previewTableContainer'; cont.style.marginTop = '20px'; const main = document.getElementById('mainForm') || document.body; main.parentNode.insertBefore(cont, main.nextSibling); }

    // build simple table matching image columns
    let html = '<div class="preview-box" style="border:1px solid #e6e6e6;padding:12px;background:#fff;">';
    html += '<h3>Preview - Solicitações enviadas</h3>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
    html += '<thead><tr style="background:#f7f7f7;color:#333;"><th style="padding:8px;border:1px solid #eee;text-align:left;">Ações</th><th style="padding:8px;border:1px solid #eee;text-align:left;">Id</th><th style="padding:8px;border:1px solid #eee;text-align:left;">Órgão</th><th style="padding:8px;border:1px solid #eee;text-align:left;">GIDs</th><th style="padding:8px;border:1px solid #eee;text-align:left;">Fonte</th><th style="padding:8px;border:1px solid #eee;text-align:left;">NUP</th><th style="padding:8px;border:1px solid #eee;text-align:left;">Data Movimentação</th><th style="padding:8px;border:1px solid #eee;text-align:right;">Valor Deliberado (A)</th><th style="padding:8px;border:1px solid #eee;text-align:right;">Valor Pedido (B)</th><th style="padding:8px;border:1px solid #eee;text-align:right;">Valor Revisado (C)</th></tr></thead>';
    html += '<tbody>';
    registros.forEach(r=>{
      html += `<tr>`;
      html += `<td style="padding:8px;border:1px solid #eee;">✔</td>`;
      html += `<td style="padding:8px;border:1px solid #eee;">${r.id}</td>`;
      html += `<td style="padding:8px;border:1px solid #eee;">${escapeHtml(r.orgao||'')}</td>`;
      html += `<td style="padding:8px;border:1px solid #eee;">${escapeHtml(r.gids||'')}</td>`;
      html += `<td style="padding:8px;border:1px solid #eee;">${escapeHtml(r.fonte||'')}</td>`;
      html += `<td style="padding:8px;border:1px solid #eee;">${escapeHtml(r.nup||'')}</td>`;
      html += `<td style="padding:8px;border:1px solid #eee;">${escapeHtml(r.data_movimentacao||'')}</td>`;
      html += `<td style="padding:8px;border:1px solid #eee;text-align:right;">${fmt(r.valor_deliberado||0)}</td>`;
      html += `<td style="padding:8px;border:1px solid #eee;text-align:right;">${fmt(r.valor_pedido||0)}</td>`;
      html += `<td style="padding:8px;border:1px solid #eee;text-align:right;">${fmt(r.valor_revisado||0)}</td>`;
      html += `</tr>`;
    });
    html += '</tbody></table>';
    html += '<div style="margin-top:8px;text-align:right;"><button id="previewExportBtn" class="btn-action-small">Exportar CSV</button></div>';
    html += '</div>';
    cont.innerHTML = html;

    const expBtn = document.getElementById('previewExportBtn'); if(expBtn){ expBtn.addEventListener('click', ()=>{ exportPreviewCSV(registros); }); }
  }

  function exportPreviewCSV(registros){
    const header = ['Id','Órgão','GIDs','Fonte','NUP','Data Movimentação','Valor Deliberado (A)','Valor Pedido (B)','Valor Revisado (C)'];
    const rows = registros.map(r=>[r.id,r.orgao,r.gids,r.fonte,r.nup,r.data_movimentacao, (r.valor_deliberado||0).toFixed(2),(r.valor_pedido||0).toFixed(2),(r.valor_revisado||0).toFixed(2)]);
    const csv = [header].concat(rows).map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'solicitacoes_preview.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]; }); }

  // ---------- persistence ----------
  function saveDraft(){ try{ const state = { currentTipo: currentTipo, suplHtml: document.getElementById('suplBlocks')?document.getElementById('suplBlocks').innerHTML:'', remajHtml: document.getElementById('remajBlocks')?document.getElementById('remajBlocks').innerHTML:'', justificativa: document.getElementById('justificativa')?document.getElementById('justificativa').value:'', fonte: document.getElementById('selectFonte')?document.getElementById('selectFonte').value:'' }; localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){ console.warn('saveDraft',e);} }
  function clearDraft(){ localStorage.removeItem(STORAGE_KEY); const supr=document.getElementById('suplBlocks'); if(supr) supr.innerHTML=''; const rem=document.getElementById('remajBlocks'); if(rem) rem.innerHTML=''; }

  function restoreDraft(){ try{ const raw = localStorage.getItem(STORAGE_KEY); if(!raw) return; const state = JSON.parse(raw); if(state.currentTipo){ currentTipo = state.currentTipo; const stepSel = document.getElementById('stepSel'); const mainForm = document.getElementById('mainForm'); if(stepSel && mainForm){ stepSel.classList.add('hidden'); mainForm.classList.remove('hidden'); } const tipoBadge = document.getElementById('tipoBadge'); if(tipoBadge) tipoBadge.textContent = (currentTipo||'').toUpperCase(); if(currentTipo==='suplementacao'){ const suprSec = document.getElementById('suplementacaoSection'); const remSec = document.getElementById('remanejamentoSection'); if(suprSec) suprSec.classList.remove('hidden'); if(remSec) remSec.classList.add('hidden'); } else { const suprSec = document.getElementById('suplementacaoSection'); const remSec = document.getElementById('remanejamentoSection'); if(remSec) remSec.classList.remove('hidden'); if(suprSec) suprSec.classList.add('hidden'); } }
    if(state.suplHtml && document.getElementById('suplBlocks')) document.getElementById('suplBlocks').innerHTML = state.suplHtml;
    if(state.remajHtml && document.getElementById('remajBlocks')) document.getElementById('remajBlocks').innerHTML = state.remajHtml;
    if(state.justificativa && document.getElementById('justificativa')) document.getElementById('justificativa').value = state.justificativa;
    if(state.fonte && document.getElementById('selectFonte')) document.getElementById('selectFonte').value = state.fonte;
    // normalize UI for older rascunhos
    normalizeRemajButtons();
    // reattach handlers
    const maxUid = findMaxUid(); gidUid = Math.max(gidUid, maxUid+1);
    suplCount = document.querySelectorAll('#suplBlocks .item-block').length; remajCount = document.querySelectorAll('#remajBlocks .item-block').length;
    // attach distribution/remove handlers
    document.querySelectorAll('[data-action=\"distribuir\"]').forEach(b=>{ b.addEventListener('click', distribuirIgualBound); });
    document.querySelectorAll('[data-action=\"remove-gid\"]').forEach(b=>{ b.addEventListener('click', removeGidBound); });
    document.querySelectorAll('[id^=\"total-input-\"]').forEach(inp=>{ inp.addEventListener('input', validarTetoBound); });
    document.querySelectorAll('[id^=\"sup-\"]').forEach(inp=>{ inp.addEventListener('input', validarTetoBound); });
    buildResumo(); updateSalvarState(); }catch(e){ console.warn('restoreDraft',e);} }

  // ---------- global handlers ----------
  function setupGlobal(){
    const btnAddSupl = document.getElementById('btnAddSupl'); if(btnAddSupl) btnAddSupl.addEventListener('click', addSupl);
    const btnAddRemaj = document.getElementById('btnAddRemaj'); if(btnAddRemaj) btnAddRemaj.addEventListener('click', addRemaj);

    document.addEventListener('click', function(e){
      const btn = e.target.closest && e.target.closest('[data-action]');
      if(!btn) return;
      const action = btn.getAttribute('data-action');
      if(!action) return;

      if (action === 'remove-block'){
        const block = btn.getAttribute('data-block'); if (block) removeBlockById(block);
        return;
      }

      if (action === 'add-remaj-leg'){
        const remaj = btn.getAttribute('data-remaj'); const role = btn.getAttribute('data-role');
        if (remaj && role){
          const containerId = (role === 'orig' ? 'orig-' : 'dest-') + remaj;
          addRemajLeg(containerId, role, parseInt(remaj,10));
        }
        return;
      }

      if (action === 'distribuir'){
        const uid = parseInt(btn.getAttribute('data-uid'),10); if(!isNaN(uid)) distribuirIgual(uid); return;
      }

      if (action === 'remove-gid'){
        const uid = parseInt(btn.getAttribute('data-uid'),10); if(!isNaN(uid)) removeGid(uid); return;
      }

    }, false);

    const btnClearDraft = document.getElementById('btnClearDraft'); if(btnClearDraft) btnClearDraft.addEventListener('click', ()=>{ if(confirm('Limpar rascunho? Esta ação é irreversível.')) clearDraft(); });
    const fileInput = document.getElementById('fileInput'); if(fileInput) fileInput.addEventListener('change', function(e){ const files = Array.from(e.target.files || []); const names = files.map(f=>f.name); const el = document.getElementById('attachmentsList'); if(el) el.innerHTML = names.map(n=>`<div style=\"padding:6px 0\">📎 ${n}</div>`).join(''); try{ const st = JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'); st.attachments = names; localStorage.setItem(STORAGE_KEY, JSON.stringify(st)); }catch(e){} });
    const btnSalvar = document.getElementById('btnSalvar'); if(btnSalvar) btnSalvar.addEventListener('click', onSubmit);
    const just = document.getElementById('justificativa'); if(just) just.addEventListener('input', ()=>{ buildResumo(); saveDraft(); updateSalvarState(); });
    const fonte = document.getElementById('selectFonte'); if(fonte) fonte.addEventListener('change', ()=>{ updateSalvarState(); saveDraft(); });
  }

  function removeBlockById(id){ const el = document.getElementById(id); if(!el) return; el.remove(); saveDraft(); buildResumo(); updateSalvarState(); }

  // ---------- init ----------
  function init(){ setupGlobal(); restoreDraft(); // ensure normalization also on first load
    normalizeRemajButtons(); buildResumo(); document.addEventListener('input', function(){ saveDraft(); }, {capture:true}); updateSalvarState(); }

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
