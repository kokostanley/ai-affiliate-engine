// ============================================
// API ROUTES - PRODUCTS
// ============================================

import { Router } from 'express';
import slugify from 'slugify';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Schema validation
const createProductSchema = {
  name: { type: 'string', required: true },
  category: { type: 'string', required: true },
  price: { type: 'number', required: true },
  commission: { type: 'number', required: true },
  affiliatePlatform: { type: 'string', required: true },
  affiliateLink: { type: 'string', required: true },
  imageUrl: { type: 'string', required: false },
  description: { type: 'string', required: false },
};

// ============================================
// GET /api/products
// ============================================
router.get('/', async (req, res) => {
  try {
    const { status, category, platform, search, page = '1', limit = '20' } = req.query;

    const where: any = {};

    if (status) {
      where.status = status;
    } else {
      where.status = { not: 'ARCHIVED' };
    }

    if (category) where.category = category;
    if (platform) where.affiliatePlatform = platform;
    if (search) where.name = { contains: search as string };

    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 100);
    const skip = (pageNum - 1) * limitNum;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          links: { select: { id: true, slug: true, clicks: true, status: true } },
          contents: { select: { id: true, status: true, approvalStatus: true } },
          _count: { select: { links: true, contents: true, scheduledPosts: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.product.count({ where }),
    ]);

    res.json({
      success: true,
      data: { products, pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) } },
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Gagal mengambil data produk.' } });
  }
});

// ============================================
// GET /api/products/:id
// ============================================
router.get('/:id', async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        links: true,
        contents: { where: { status: { not: 'ARCHIVED' } }, orderBy: { createdAt: 'desc' }, take: 10 },
        scheduledPosts: { where: { status: { in: ['SCHEDULED', 'POSTING'] } }, orderBy: { scheduledAt: 'asc' } },
        _count: { select: { links: true, contents: true, scheduledPosts: true } },
      },
    });

    if (!product) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Produk tidak ditemukan.' } });
    }

    res.json({ success: true, data: product });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Gagal mengambil data produk.' } });
  }
});

// ============================================
// POST /api/products
// ============================================
router.post('/', async (req, res) => {
  try {
    const { name, category, price, commission, affiliatePlatform, affiliateLink, imageUrl, description } = req.body;

    if (!name || !category || !price || !commission || !affiliatePlatform || !affiliateLink) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Data tidak lengkap.' } });
    }

    // Generate unique slug
    let slug = slugify(name, { lower: true, strict: true });
    let counter = 1;

    while (await prisma.product.findUnique({ where: { slug } })) {
      slug = `${slugify(name, { lower: true, strict: true })}-${counter}`;
      counter++;
    }

    // Calculate commission amount
    const commissionAmount = (price * commission) / 100;

    // Create product
    const product = await prisma.product.create({
      data: {
        name,
        slug,
        category,
        price: price,
        commission: commission,
        commissionAmount: commissionAmount,
        affiliatePlatform,
        affiliateLink,
        imageUrl,
        description,
        status: 'ACTIVE',
      },
    });

    // Create short link
    await prisma.link.create({
      data: {
        slug,
        productId: product.id,
        originalLink: affiliateLink,
        status: 'ACTIVE',
      },
    });

    res.status(201).json({ success: true, data: product, message: 'Produk berhasil dibuat.' });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ success: false, error: { code: 'CREATE_ERROR', message: 'Gagal membuat produk baru.' } });
  }
});

// ============================================
// PUT /api/products/:id
// ============================================
router.put('/:id', async (req, res) => {
  try {
    const existingProduct = await prisma.product.findUnique({ where: { id: req.params.id } });

    if (!existingProduct) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Produk tidak ditemukan.' } });
    }

    const updateData: any = { ...req.body };

    // Recalculate commission if needed
    if (req.body.price !== undefined || req.body.commission !== undefined) {
      const newPrice = req.body.price ?? existingProduct.price;
      const newCommission = req.body.commission ?? existingProduct.commission;
      updateData.commissionAmount = (newPrice * newCommission) / 100;
    }

    const product = await prisma.product.update({ where: { id: req.params.id }, data: updateData });
    res.json({ success: true, data: product, message: 'Produk berhasil diperbarui.' });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'UPDATE_ERROR', message: 'Gagal memperbarui produk.' } });
  }
});

// ============================================
// PATCH /api/products/:id/status
// ============================================
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;

    if (!['ACTIVE', 'PAUSED', 'ARCHIVED'].includes(status)) {
      return res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Status tidak valid.' } });
    }

    const product = await prisma.product.update({ where: { id: req.params.id }, data: { status } });
    res.json({ success: true, data: product, message: `Status produk berhasil diubah ke ${status}.` });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'UPDATE_ERROR', message: 'Gagal mengubah status produk.' } });
  }
});

// ============================================
// DELETE /api/products/:id
// ============================================
router.delete('/:id', async (req, res) => {
  try {
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });

    if (!product) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Produk tidak ditemukan.' } });
    }

    await prisma.product.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Produk berhasil dihapus.' });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'DELETE_ERROR', message: 'Gagal menghapus produk.' } });
  }
});

// ============================================
// GET /api/products/categories
// ============================================
router.get('/metadata/categories', async (req, res) => {
  try {
    const categories = await prisma.product.findMany({
      where: { status: { not: 'ARCHIVED' } },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });

    res.json({ success: true, data: categories.map(c => c.category) });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'FETCH_ERROR', message: 'Gagal mengambil kategori.' } });
  }
});

export default router;