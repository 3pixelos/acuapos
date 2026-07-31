-- One-off: change the S7 order (316 DH, closed 21 juil 00:19, waiter Kawtar)
-- from Carte to Espèces. Targets that single payment row by id.
update payments
set method = 'cash'
where id = 'bd741647-9eea-4943-8efe-e2d9cbb80eb0'
  and amount = 316 and method = 'card';
