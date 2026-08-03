-- 20260803_001_movimientos_inventario_estado.sql
--
-- Agrega columna `estado` a `movimientos_inventario` para poder marcar
-- las SALIDAs de ventas anuladas y filtrarlas en los reportes de
-- rotación de inventario y productos sin movimiento.
--
-- Contexto: al anular una venta, `POST /api/ventas/[id]/anular` crea una
-- ENTRADA compensatoria pero deja la SALIDA original intacta. Los reportes
-- que miran movimientos crudos (rotación, sin-movimiento) por eso siguen
-- viendo la venta como "efectiva". Con este campo:
--   - la SALIDA original se marca estado='anulada'
--   - los reportes filtran estado='activa' (o estado != 'anulada')
--   - el kardex sigue mostrando ambos movimientos para trazabilidad
--
-- Migración aditiva + idempotente.

SET search_path TO autorepuestosfelix, public;

ALTER TABLE movimientos_inventario
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'activa';

-- CHECK laxo — permite futuro 'ajustada' / 'reversado' sin nueva migración.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'movimientos_inventario_estado_check'
  ) THEN
    ALTER TABLE movimientos_inventario
      ADD CONSTRAINT movimientos_inventario_estado_check
      CHECK (estado IN ('activa', 'anulada'));
  END IF;
END $$;

-- Índice parcial: los reportes filtran por (empresa_id, producto_id, tipo,
-- fecha) donde estado='activa'. Los anulados son minoría → índice parcial
-- mantiene el existente chico.
CREATE INDEX IF NOT EXISTS movimientos_inventario_activos_idx
  ON movimientos_inventario (empresa_id, producto_id, tipo, fecha)
  WHERE estado = 'activa';
