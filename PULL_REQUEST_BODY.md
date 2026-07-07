# Pull Request

Refactor: distribuirIgual em centavos, remover blocos, localStorage, testes

Corrige distribuição por centavos, adiciona botões Remover, validações mais robustas, persistência de rascunho via localStorage e testes unitários para a função de distribuição.

Critérios de aceite:
1. Ao clicar “Distribuir igualmente” a soma dos 12 meses deve ser exatamente igual ao teto informado.
2. Se soma dos meses > teto, o bloco mostra erro e o botão “Concluir Solicitação” fica desabilitado.
3. É possível remover MAPP/GID/Remanejamento e isso limpa os inputs relacionados.
4. Rascunho é salvo no navegador (localStorage) e restaurado ao reabrir a página.
