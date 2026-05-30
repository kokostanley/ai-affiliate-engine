// Workflow API Routes
import { Router } from 'express';
import { runAddWorkflow, getPreviewData } from '../../services/workflow';

const router = Router();

router.post('/add', async (req, res) => {
  const { link } = req.body;

  if (!link) {
    return res.status(400).json({ success: false, error: 'Link required' });
  }

  try {
    const result = await runAddWorkflow(link);
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/preview/:id', async (req, res) => {
  try {
    const preview = await getPreviewData(req.params.id);
    if (!preview) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    res.json({ success: true, data: preview });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;