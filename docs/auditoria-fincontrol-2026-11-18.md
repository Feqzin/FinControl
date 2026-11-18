# Auditoria do FinControl — 18/11/2026

## Escopo e limites

Revisão do código da interface, sessão, consultas/cache, rotas, autenticação, serviços financeiros, publicação e testes. Ponto de partida publicado: `6fd841da86289b459bd919ea0069e6bb7aa59988`. As alterações desta auditoria estão descritas abaixo.

A avaliação combina inspeção de código, a captura fornecida pelo usuário, testes automatizados locais e consulta aos erros de runtime da Vercel. Não houve sessão autenticada disponível para percorrer a interface em produção. Não foram executados testes contra o banco de produção, testes de carga ou scanner atualizado de dependências. Portanto, este relatório não certifica ausência de falhas de segurança, integridade integral do banco ou desempenho real de todas as telas.

## Resultado executivo

O sistema tem boa cobertura de regras financeiras e várias proteções implementadas. A prioridade é consolidar confiabilidade: troca de conta sem cache antigo, recuperação de senha realmente funcional, atualização consistente das telas e testes com um banco isolado. No visual, a principal fragilidade é misturar cores fixas com cores do tema.

## Ajustes aplicados nesta revisão

| Prioridade | Problema confirmado | Ajuste |
|---|---|---|
| Alta | Ao fazer login/logout, o cliente alterava apenas `/api/auth/me`, mantendo consultas financeiras sem chave de usuário e com cache permanente. Isso permitia reapresentar dados antigos ao trocar de conta no mesmo navegador. | Cancela consultas da conta anterior, remove os dados de cache e então substitui a sessão. Dois testes cobrem troca de conta e resposta antiga chegando depois da troca. Não foi identificado acesso indevido ao banco; o problema confirmado é no cache do cliente. |
| Média | Meses futuros/fechados no seletor de faturas usavam fundos claros fixos (`bg-indigo-100`, `bg-slate-200`, etc.), sem adaptação ao dark. | Meses não selecionados usam superfícies neutras do tema. O selecionado usa a cor pessoal e o respectivo texto de contraste. As informações Atual/Futura/Fechada continuam visíveis. |
| Média | A folha de fontes declarava 25 famílias, embora a interface use Open Sans e Geist. | Reduzida a declaração para essas duas famílias. Isso elimina definições desnecessárias; o ganho de tempo precisa ser medido em rede real. Não significa que 25 arquivos de fonte fossem baixados. |
| Média | O comando padrão de testes do cliente incluía apenas `pages-utils.unit.test.ts`; novos testes de atalhos e sessão ficavam fora. Preferências e testes de segurança também não participavam de `npm test`. | O comando do cliente agora inclui todos os seus testes. A suíte padrão passa a incluir preferências de conta e segurança. Ainda é necessário configurar CI para executar e exigir esses testes antes da publicação. |

Arquivos centrais: `client/src/components/cartoes/CartoesFilterBar.tsx`, `client/src/hooks/use-auth.ts`, `client/src/lib/session-cache.ts`, `client/index.html` e `package.json`.

## Achados pendentes por prioridade

### 1. Alta — completar a recuperação de senha

Em `serverless/auth.ts`, o fluxo de esquecimento gera e grava um token, mas em produção retorna a mensagem genérica sem chamar um serviço de envio de e-mail. A linha de desenvolvimento informa que o link seria enviado em produção, porém esse envio não está implementado nesse fluxo. O mesmo padrão existe em `server/auth.ts`.

**Impacto:** o usuário pode pedir recuperação e não receber um caminho para recuperar o acesso.

**Próximo ajuste:** definir e integrar um provedor de e-mail, confirmar o endereço do usuário, testar o envio e a expiração do token e invalidar sessões antigas após redefinição. Manter a resposta genérica para evitar expor se uma conta existe.

### 2. Alta — validar isolamento e pagamentos com banco de teste real

Os testes de integração usam `TEST_DATABASE_URL` ou `DATABASE_URL_TEST`. Sem essas variáveis e um banco acessível, os testes são ignorados. Nesta revisão, 72 testes foram ignorados, incluindo casos de isolamento entre usuários e persistência financeira.

**Impacto:** testes simulados ajudam, mas não demonstram que migrations, constraints, transações, permissões e consultas reais funcionam em conjunto.

**Próximo ajuste:** criar ambiente isolado, aplicar migrations, executar a suíte com zero skips esperados de integração e testar usuário A versus B, pagamento parcial/total, estorno, importação e restauração. Nunca usar o banco de produção para o script de reset dos testes.

### 3. Alta — uniformizar atualização de dados após alterações

O cache geral usa `staleTime: Infinity`, sem atualização ao focar a janela. Isso exige que toda alteração invalide corretamente todas as telas afetadas. Em `usePessoas.ts`, editar pessoa invalida apenas `/api/pessoas`; o Painel pode continuar usando uma cópia antiga dentro de `/api/dashboard/overview`. A exclusão permanente invalida o resumo financeiro, mas não a visão geral do Painel. Também há alterações de pagamentos de serviços que invalidam listas específicas sem todos os agregados.

**Impacto:** nomes, saldos ou estados podem parecer desatualizados após navegar entre telas. Não é evidência de cálculo incorreto no banco.

**Próximo ajuste:** centralizar as invalidações por domínio e testar o percurso alteração → Pessoas → Dívidas → Painel. Definir validade finita para dados financeiros que podem mudar em outra aba/dispositivo. Usar chaves que incluam usuário nos dados privados como defesa adicional.

### 4. Média — medir e reduzir a espera inicial

O loading melhora a apresentação, mas não reduz a duração das requisições. `serverless/db.ts` configura o pool com uma conexão; o resumo carrega várias coleções. Pode ser uma escolha intencional para limitar conexões, mas também pode serializar trabalho. O endpoint de overview devolve listas e agregados juntos, crescendo conforme a conta aumenta. A versão local do serviço financeiro ainda pode carregar contexto duas vezes; a versão serverless já usa um contexto para construir o resumo.

**Próximo ajuste:** medir p50/p95 do login, overview e primeiras consultas; revisar região da função em relação ao banco, volume de dados e índices; paginar históricos; só então ajustar pool e consultas. Não aumentar conexões sem medir o limite do Supabase e a concorrência da Vercel.

### 5. Média — consolidar migrações e publicação

O build de produção chama um script específico que reaplica migrations de preferências. Há outro migrador com checksum em `script/db-migrate.ts`, formando dois caminhos de atualização. Não foi encontrado workflow de CI na árvore analisada. O build da Vercel faz checagem serverless e compilação do cliente, sem executar a suíte de testes.

**Próximo ajuste:** uma única rotina de migrations versionadas, com registro, bloqueio contra execução concorrente e falha explícita; CI com checagem de tipos e testes; publicação após os gates. Alterações de esquema devem continuar compatíveis com a versão anterior durante a troca do deploy.

### 6. Média — prevenir novos problemas de tema

Além dos meses, existem fundos claros fixos na página de erro e em trechos da importação de faturas. Cores auxiliares índigo e outros tons também aparecem diretamente em componentes, fora da personalização.

**Próximo ajuste:** padronizar superfícies, texto secundário, seleção, aviso e sucesso em tokens semânticos. Testar pelo menos claro/escuro, azul padrão e uma cor personalizada clara. Validar foco de teclado, tamanho de toque e contraste dos textos pequenos. Criar capturas de regressão visual para seletor de mês, importação, modais e estados vazios.

### 7. Média — completar o ciclo dos grupos personalizados

Os vínculos de grupos são uma lista de IDs em JSON. A API verifica se cada dívida pertence ao usuário ao salvar, o que é positivo. Porém, se uma dívida for excluída permanentemente, seu ID pode permanecer no grupo; o formulário não exibe essa dívida para desmarcar e uma gravação futura pode ser recusada pela validação. Também falta uma ação explícita de excluir/arquivar o próprio grupo.

**Próximo ajuste:** limpar referências na exclusão ou apresentar vínculos indisponíveis com opção de remoção; permitir arquivar/excluir o grupo preservando as dívidas; testar grupos vazios, mistos, com itens removidos e filtrados.

### 8. Média — reduzir divergência entre runtimes

A checagem diagnóstica encontrou 69 rotas diretas comuns e seis adicionais no serverless: duas de diagnóstico e quatro de cobrança/trial. Essa diferença não implica que todas sejam defeitos; parte pode ser intencional. O script atual analisa declarações diretas em dois arquivos e não o inventário completo de todos os registradores importados. A autenticação também possui implementações grandes separadas.

**Próximo ajuste:** documentar diferenças intencionais; compartilhar regras de domínio e autenticação; ampliar a verificação de paridade para os módulos de rotas. Evitar corrigir um runtime e deixar o outro com comportamento diferente.

### 9. Média — fortalecer proteção de autenticação e observabilidade

Há hash de senha com scrypt, salt aleatório, comparação segura, cookies HttpOnly e exigência de Secure em produção; login regenera sessão. O limitador de login é definido com 20 tentativas a cada 15 minutos sem store distribuído configurado naquele limiter. Em ambiente com várias instâncias, o comportamento global precisa ser validado. Não foi encontrada uma proteção geral explícita por token CSRF/Origin; cookies SameSite ajudam, mas a necessidade depende da configuração efetiva e dos fluxos.

**Próximo ajuste:** validar proteção de escrita e rate limit distribuído no ambiente real; testar revogação de sessões; acompanhar erros de frontend e latência de API, além dos erros de runtime. Isso é uma recomendação de endurecimento, não uma vulnerabilidade explorada demonstrada nesta revisão.

### 10. Baixa/média — concluir a experiência Essencial

Há telas grandes e densas: Cartões tem aproximadamente 3.240 linhas no container; Pessoas, 1.905; Dashboard, 1.715. O número de linhas não prova lentidão, mas aumenta a dificuldade de manutenção e consistência visual.

**Próximos ajustes de produto:**

- Cartões: mostrar primeiro fatura do mês, vencimento e ação de pagamento; histórico e importação em segundo nível.
- Pessoas: separar claramente “você recebe” e “você paga” nos detalhes, sem compensar saldos de naturezas diferentes.
- Dívidas: dentro de um grupo, priorizar vencidas e a próxima parcela; filtros extras recolhidos.
- Serviços: separar assinaturas ativas de pausadas/canceladas e mostrar a próxima cobrança.
- Personalização: sincronizar tema claro/escuro e modo de uso na conta, se a intenção for manter tudo igual entre dispositivos. Hoje cor/atalhos/grupos têm sincronização, enquanto outras escolhas continuam locais.
- Estados vazios e erros: sempre indicar o próximo passo, preservando filtros e dados preenchidos ao tentar novamente.

## Evidências de verificação

| Verificação | Resultado |
|---|---|
| Bateria ampla local: testes de servidor, cliente e segurança serverless | 588 testes; 516 aprovados, zero falhas, 72 ignorados por dependência de banco isolado |
| Dois testes novos de isolamento do cache de sessão | 2 aprovados |
| Comando atualizado de testes do cliente | 290 aprovados, zero falhas |
| Tipos do cliente/servidor e serverless | Aprovados |
| Build do cliente | Aprovado |
| Rotina operacional local | Zero erros e zero avisos; seis informações de workspace/distribuição |
| Paridade diagnóstica de rotas diretas | 69 comuns; seis exclusivas de serverless; alcance limitado aos arquivos lidos pelo script |
| Vercel: consulta de clusters de erros de runtime nas últimas 24 horas | Nenhum registro retornado; isso não cobre necessariamente falhas de interface ou requisições não exercitadas |
| Banco real, políticas RLS de todas as tabelas e fluxo autenticado em produção | Não validados nesta revisão |

## Ordem sugerida para as próximas etapas

1. Exercitar troca de conta e seletor de mês no sistema publicado, em claro e escuro.
2. Colocar recuperação de senha por e-mail para funcionar de ponta a ponta.
3. Rodar testes de isolamento e pagamentos em PostgreSQL isolado.
4. Centralizar atualização do cache e definir política para múltiplas abas/dispositivos.
5. Medir o carregamento inicial e otimizar as consultas mais lentas.
6. Unificar tokens visuais e simplificar Cartões e Serviços, seguindo o modo Essencial.
7. Consolidar migrations, CI e monitoramento contínuo.
