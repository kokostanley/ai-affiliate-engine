// ============================================
// ASSET MANAGEMENT API ROUTES
// Cloud storage asset management
// ============================================

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import * as cloudStorage from '../../services/cloud-storage';

const router = Router();
const prisma = new PrismaClient();

// ============================================
// GET /api/assets
// List all assets with filters
// ============================================

router.get('/', async (req, res) => {
  try {
    const { productId, fileType, cloudProvider, status, search, limit, offset } = req.query;

    const result = await cloudStorage.listAssets({
      productId: productId as string,
      fileType: fileType as string,
      cloudProvider: cloudProvider as any,
      status: status as any,
      search: search as string,
      limit: parseInt(limit as string) || 50,
      offset: parseInt(offset as string) || 0,
    });

    res.json({
      success: true,
      data: {
        assets: result.assets,
        pagination: {
          total: result.total,
          limit: parseInt(limit as string) || 50,
          offset: parseInt(offset as string) || 0,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

// ============================================
// GET /api/assets/stats/usage
// Get storage usage statistics
// ============================================

router.get('/stats/usage', async (req, res) => {
  try {
    const usage = await cloudStorage.getStorageStats();

    // Convert BigInt to Number for JSON serialization
    const serializableUsage = {
      local: {
        count: usage.local.count,
        size: Number(usage.local.size),
        files: usage.local.files.map(f => ({
          ...f,
          localSize: Number(f.localSize),
          localCachedAt: f.localCachedAt,
        })),
      },
      googleDrive: {
        count: usage.googleDrive.count,
        size: Number(usage.googleDrive.size),
      },
      dropbox: {
        count: usage.dropbox.count,
        size: Number(usage.dropbox.size),
      },
      summary: {
        totalFiles: usage.summary.totalFiles,
        totalSize: Number(usage.summary.totalSize),
        byProvider: usage.summary.byProvider,
      },
    };

    res.json({ success: true, data: serializableUsage });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

// ============================================
// GET /api/assets/providers
// Get configured storage providers
// ============================================

router.get('/providers', async (req, res) => {
  try {
    const providers = cloudStorage.getConfiguredProviders();
    res.json({ success: true, data: providers });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

// ============================================
// GET /api/assets/google-drive/status
// Test Google Drive connection
// ============================================

router.get('/google-drive/status', async (req, res) => {
  try {
    const { testGoogleDriveConnection, getGoogleDriveStorageInfo, isGoogleDriveConfigured, isGoogleDriveFullyConfigured } = cloudStorage;

    const status = await testGoogleDriveConnection();
    const fullyConfigured = isGoogleDriveFullyConfigured();
    const configured = isGoogleDriveConfigured();

    res.json({
      success: true,
      data: {
        connected: status.connected,
        configured,
        fullyConfigured,
        message: status.message,
        folderId: status.folderId,
        needsSetup: !fullyConfigured,
        setupGuide: {
          step1: 'Create OAuth 2.0 credentials at console.cloud.google.com',
          step2: 'Add to .env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET',
          step3: 'Get refresh token via OAuth flow',
          step4: 'Add GOOGLE_REFRESH_TOKEN to .env',
          step5: 'Restart server and run /storage command',
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

// ============================================
// POST /api/assets/google-drive/test
// Test upload to Google Drive
// ============================================

router.post('/google-drive/test', async (req, res) => {
  try {
    const { testGoogleDriveConnection, uploadFile, isGoogleDriveConfigured } = cloudStorage;

    if (!isGoogleDriveConfigured()) {
      return res.status(400).json({
        success: false,
        error: { code: 'NOT_CONFIGURED', message: 'Google Drive not configured. Add tokens to .env' },
      });
    }

    // Create a test file
    const testContent = `AI Affiliate Engine - Test File\nCreated: ${new Date().toISOString()}\nThis is a test file for Google Drive integration.`;
    const testFileName = `test_${Date.now()}.txt`;
    const tempDir = process.env.LOCAL_TEMP_DIR || './tmp';

    const fs = require('fs');
    const path = require('path');
    const testFilePath = path.join(tempDir, testFileName);

    // Ensure temp dir exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Write test file
    fs.writeFileSync(testFilePath, testContent);

    // Upload to Google Drive
    const uploadResult = await uploadFile(testFilePath, testFileName, {
      provider: 'GOOGLE_DRIVE',
    });

    // Clean up temp file
    try {
      fs.unlinkSync(testFilePath);
    } catch {}

    if (uploadResult.success) {
      // Create test AssetFile in DB
      const testAsset = await prisma.assetFile.create({
        data: {
          fileName: testFileName,
          fileType: 'TEST',
          provider: 'TEST',
          cloudProvider: 'GOOGLE_DRIVE',
          cloudUrl: uploadResult.cloudUrl,
          cloudFileId: uploadResult.cloudFileId,
          uploadStatus: 'uploaded',
          uploadedAt: new Date(),
        },
      });

      res.json({
        success: true,
        data: {
          uploaded: true,
          cloudUrl: uploadResult.cloudUrl,
          cloudFileId: uploadResult.cloudFileId,
          assetId: testAsset.id,
          message: 'Test file uploaded successfully to Google Drive!',
        },
      });
    } else {
      res.status(400).json({
        success: false,
        error: { code: 'UPLOAD_FAILED', message: uploadResult.error },
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

// ============================================
// GET /api/assets/google-drive/setup-guide
// Get Google OAuth setup guide
// ============================================

router.get('/google-drive/setup-guide', async (req, res) => {
  res.json({
    success: true,
    data: {
      title: 'Google Drive OAuth Setup Guide',
      overview: 'Configure Google Drive as primary storage. Cloud folders will be created automatically.',
      localProject: {
        path: 'C:\\Users\\Jason Lee\\ai-affiliate-engine',
        status: 'exists',
      },
      cloudFolders: {
        root: 'AI-Affiliate-Engine',
        brands: ['Crypto-EW', 'Pippit-Manual'],
        willBeCreated: true,
      },
      storedAssets: [
        'Rendered videos (VEO, Seedance, Sora, Higgsfield)',
        'Generated images (DALL-E, Midjourney)',
        'Carousel graphics',
        'Pippit prompt files',
        'Distribution assets',
        'Export logs',
      ],
      steps: [
        {
          step: 1,
          title: 'Create Google Cloud Project',
          description: 'Go to console.cloud.google.com and create a new project.',
          url: 'https://console.cloud.google.com/',
        },
        {
          step: 2,
          title: 'Enable Google Drive API',
          description: 'Go to APIs & Services > Library and enable "Google Drive API".',
          url: 'https://console.cloud.google.com/apis/library/drive.googleapis.com',
        },
        {
          step: 3,
          title: 'Create OAuth 2.0 Credentials',
          description: 'Go to APIs & Services > Credentials > Create Credentials > OAuth Client ID. Set Application Type to "Desktop app" and download the JSON.',
          url: 'https://console.cloud.google.com/apis/credentials',
        },
        {
          step: 4,
          title: 'Get Refresh Token',
          description: 'Use the provided OAuth credentials to get a refresh token. You can use the provided script or OAuth playground.',
          action: 'POST /api/assets/google-drive/generate-token',
        },
        {
          step: 5,
          title: 'Update .env File',
          description: 'Add the following to your .env file:',
          envVars: {
            GOOGLE_CLIENT_ID: 'your-client-id',
            GOOGLE_CLIENT_SECRET: 'your-client-secret',
            GOOGLE_REFRESH_TOKEN: 'your-refresh-token',
            STORAGE_PROVIDER: 'GOOGLE_DRIVE',
          },
        },
        {
          step: 6,
          title: 'Test Connection',
          description: 'Run /storage command in Telegram bot or call GET /api/assets/google-drive/status',
        },
      ],
      envExample: `# Google Drive OAuth
GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=ABCDEFGHIJKLMNOPQRSTUV
GOOGLE_REFRESH_TOKEN=1//0ABCDEFGHIJKLMNOPQRSTUVWXYZ

# Storage Provider
STORAGE_PROVIDER=GOOGLE_DRIVE`,
      notes: [
        'Keep your credentials secure and never commit them to version control.',
        'Refresh tokens are long-lived but may need to be regenerated if revoked.',
        'The root folder "AI-Affiliate-Engine" will be created automatically.',
      ],
    },
  });
});

// ============================================
// POST /api/assets/google-drive/generate-token
// Generate OAuth refresh token
// ============================================

router.post('/google-drive/generate-token', async (req, res) => {
  try {
    const { code, redirectUri } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_CODE', message: 'Authorization code required' },
      });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirect = redirectUri || 'http://localhost:3000';

    if (!clientId || !clientSecret) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_CREDENTIALS', message: 'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env first' },
      });
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirect,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      return res.status(400).json({
        success: false,
        error: { code: 'TOKEN_EXCHANGE_FAILED', message: error },
      });
    }

    const tokens: any = await tokenResponse.json();

    res.json({
      success: true,
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresIn: tokens.expires_in,
        tokenType: tokens.token_type,
        instructions: {
          step1: 'Copy the refresh_token value',
          step2: 'Add it to your .env file as GOOGLE_REFRESH_TOKEN',
          step3: 'Restart the server',
          step4: 'Run /storage to verify connection',
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

// ============================================
// GET /api/assets/:id
// Get single asset details
// ============================================

router.get('/:id', async (req, res) => {
  try {
    const asset = await prisma.assetFile.findUnique({
      where: { id: req.params.id },
    });

    if (!asset) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Asset not found' },
      });
    }

    res.json({ success: true, data: asset });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

// ============================================
// POST /api/assets/upload
// Upload existing file to cloud
// ============================================

router.post('/upload', async (req, res) => {
  try {
    const { localPath, filename, provider, productId, fileType, fileName, mimeType, cloudPath } = req.body;

    if (!localPath) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'localPath is required' },
      });
    }

    const result = await cloudStorage.uploadFile(
      localPath,
      filename || fileName || 'uploaded_file',
      {
        provider: provider as any,
        productId,
        fileType,
        fileName: fileName || filename,
        mimeType,
        cloudPath,
      }
    );

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'UPLOAD_ERROR', message: result.error },
      });
    }

    res.json({
      success: true,
      data: { assetFileId: result.assetFileId, cloudUrl: result.cloudUrl },
      message: 'Asset uploaded successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

// ============================================
// POST /api/assets/cleanup
// Clean up local cache files
// ============================================

router.post('/cleanup', async (req, res) => {
  try {
    const result = await cloudStorage.cleanupLocalCache();
    res.json({
      success: true,
      data: result,
      message: `Cleaned up ${result.deleted} local file(s)`,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

// ============================================
// POST /api/assets/create
// Create asset file record (for validation)
// ============================================

router.post('/create', async (req, res) => {
  try {
    const {
      productId,
      fileName,
      fileType,
      provider,
      cloudProvider,
      cloudUrl,
      cloudFileId,
      cloudPath,
      localPath,
      fileSize,
      mimeType,
    } = req.body;

    if (!fileName || !fileType) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'fileName and fileType are required' },
      });
    }

    const asset = await prisma.assetFile.create({
      data: {
        productId: productId || null,
        fileName,
        fileType,
        provider: provider || 'MANUAL',
        cloudProvider: cloudProvider || null,
        cloudUrl: cloudUrl || null,
        cloudFileId: cloudFileId || null,
        cloudPath: cloudPath || null,
        localPath: localPath || null,
        fileSize: fileSize ? BigInt(fileSize) : null,
        mimeType: mimeType || null,
        uploadStatus: cloudUrl ? 'uploaded' : 'pending',
        uploadedAt: cloudUrl ? new Date() : null,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        assetId: asset.id,
        fileName: asset.fileName,
        fileType: asset.fileType,
        cloudUrl: asset.cloudUrl,
        cloudFileId: asset.cloudFileId,
        uploadStatus: asset.uploadStatus,
      },
      message: 'Asset created successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

// ============================================
// PATCH /api/assets/:id/link-distribution
// Link asset to distribution item
// ============================================

router.patch('/:id/link-distribution', async (req, res) => {
  try {
    const { distributionId } = req.body;

    if (!distributionId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'distributionId is required' },
      });
    }

    const distribution = await prisma.distributionQueue.findUnique({
      where: { id: distributionId },
    });

    if (!distribution) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Distribution item not found' },
      });
    }

    const asset = await prisma.assetFile.update({
      where: { id: req.params.id },
      data: { /* metadata updated separately */ },
    });

    // Update distribution with asset
    await prisma.distributionQueue.update({
      where: { id: distributionId },
      data: { assetFileId: asset.id },
    });

    res.json({
      success: true,
      data: {
        assetId: asset.id,
        distributionId,
        linked: true,
      },
      message: 'Asset linked to distribution',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

// ============================================
// DELETE /api/assets/:id
// Delete asset (cloud + local)
// ============================================

router.delete('/:id', async (req, res) => {
  try {
    const result = await cloudStorage.deleteAssetFile(req.params.id);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'DELETE_ERROR', message: result.error },
      });
    }

    res.json({ success: true, message: 'Asset deleted successfully' });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  }
});

export default router;