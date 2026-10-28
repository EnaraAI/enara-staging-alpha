import { Router } from 'express';
import {
  listBatches,
  getBatch,
  createBatch,
  updateBatch,
  deleteBatch,
} from '../controllers/batch.controller';
import { authMiddleware, requireAdmin } from '../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware, requireAdmin);

router.get('/', listBatches);
router.get('/:id', getBatch);
router.post('/', createBatch);
router.patch('/:id', updateBatch);
router.delete('/:id', deleteBatch);

export default router;
