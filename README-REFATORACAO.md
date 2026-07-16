Refatoração Limites (resumo das mudanças)

- JS extraído para assets/js/limites.js
- Função distribuirIgualCalc implementada (centavos) + export para testes
- Botões Remover em GID e blocos MAPP/Remanejamento
- Persistência via localStorage (key: limites_solicitacao_draft_v1)
- Código original salvo em original/limites_original.html

Como aplicar (git)
1. git checkout refactor/limites-distribuir-remover-localstorage-2026-07-07
2. git pull origin refactor/limites-distribuir-remover-localstorage-2026-07-07
3. Revisar arquivos: index.html, assets/js/limites.js, original/limites_original.html, tests/limites.test.js
4. git add .
5. git commit -m "Refactor: distribuirIgual em centavos, remover blocos, localStorage, testes"
6. git push origin refactor/limites-distribuir-remover-localstorage-2026-07-07
7. Abra um Pull Request na interface do GitHub a partir dessa branch para a branch padrão (main/master).

Como rodar os testes
- npm init -y
- npm i --save-dev jest
- no package.json ajuste "test": "jest"
- npm test

Critérios de aceite
1. Ao clicar “Distribuir igualmente” a soma dos 12 meses deve ser exatamente igual ao teto informado.
2. Se soma dos meses > teto, o bloco mostra erro e o botão “Concluir Solicitação” fica desabilitado.
3. É possível remover MAPP/GID/Remanejamento e isso limpa os inputs relacionados.
4. Rascunho é salvo no navegador (localStorage) e restaurado ao reabrir a página.

OBS: Para abrir o Pull Request automaticamente você pode usar o gh CLI (ex.: gh pr create --base main --head denise-albino:refactor/limites-distribuir-remover-localstorage-2026-07-07 --title "Refactor: distribuirIgual..." --body "Descrição...")
