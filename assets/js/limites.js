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

  // ---------- helpers for UI normalization ----------
  function normalizeRemajButtons(){
    // Ensure each remaj block's Origem and Destino headers have an add button (migrate older rascunhos)
    document.querySelectorAll('.item-block[id^="remaj-block-"]').forEach(rb=>{
      const id = rb.id.replace('remaj-block-','');
      const origHead = rb.querySelector('.remaj-group-head.origem');
      if(origHead && !origHead.querySelector('[data-action="add-remaj-leg"]')){
        const btn = document.createElement('button');
        btn.type='button'; btn.className='btn-action-small'; btn.setAttribute('data-action','add-remaj-leg');
        btn.setAttribute('data-remaj',id); btn.setAttribute('data-role','orig'); btn.textContent='+remanejamento';
        origHead.appendChild(btn);
      }
      const destHead = rb.querySelector('.remaj-group-head.destino');
      if(destHead && !destHead.querySelector('[data-action="add-remaj-leg"]')){
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
        <div style="display:flex;gap:8px;align-items:center;"><button type="button" class="btn-action-small" data-action="remove-block" data-block="supl-block-${id}" style="background:#fff;border[...]
