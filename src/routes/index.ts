import { Router } from 'express';
import itemsRoutes from './items.routes';
import reservationsRoutes from './reservations.routes';
import maintenanceRoutes from './maintenance.routes';

const router = Router();

router.use('/v1/items', itemsRoutes);
router.use('/v1/reservations', reservationsRoutes);
router.use('/v1/maintenance', maintenanceRoutes);

export default router;
