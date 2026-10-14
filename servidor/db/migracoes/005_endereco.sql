-- Endereço da barbearia: Av. Tancredo de Almeida Neves, 1463 - Cohab 5, Carapicuíba - SP.
-- Só preenche quando o endereço ainda está vazio: o que o Fortão já salvou no painel continua valendo.
UPDATE configuracoes
   SET valor = JSON_SET(valor,
         '$.endereco', 'Av. Tancredo de Almeida Neves, 1463',
         '$.bairro', IF(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(valor, '$.bairro')), '') = '', 'Cohab 5', JSON_UNQUOTE(JSON_EXTRACT(valor, '$.bairro'))),
         '$.cidade', 'Carapicuíba',
         '$.uf', 'SP')
 WHERE chave = 'negocio'
   AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(valor, '$.endereco')), '') = '';
