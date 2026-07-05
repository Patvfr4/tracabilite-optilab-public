-- Migration 041 : Mise à jour libellé ICR 70009
UPDATE icr_codes SET libelle = 'Envoi urgent en dehors des routes normales' WHERE code = '70009';
