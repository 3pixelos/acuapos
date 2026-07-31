-- One-off: change the T6 order (1003 DH, closed 21 juil 01:49, waiter Aya)
-- from Carte to Espèces. Targets that single payment row by id.
update payments
set method = 'cash'
where id = '1badbc85-6b9c-40d4-8291-c8d55ff0a067'
  and amount = 1003 and method = 'card';
