// ============================================
// PHASE 4 E2E VALIDATION SCRIPT
// Tests complete flow: Product → Content → Production → Rendering → Storage
// ============================================

import { PrismaClient } from '@prisma/client';
import * as higgsfield from '../services/higgsfield';
import * as pippit from '../services/pippit';
import * as storage from '../services/storage';
import { generateProductionPackage } from '../services/production';
import { executeRenderJob, processQueuedJobs, getProviderStatus } from '../services/render-engine';

const prisma = new PrismaClient();

interface ValidationResult {
  phase: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message: string;
  details?: any;
}

async function runValidation(): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  console.log('===========================================');
  console.log('PHASE 4 E2E VALIDATION');
  console.log('Product → Content → Production → Asset → Storage');
  console.log('===========================================\n');

  // ============================================
  // PHASE 0: Database Connection
  // ============================================
  console.log('[0/7] Testing database connection...');

  try {
    await prisma.$connect();
    const count = await prisma.product.count();
    results.push({
      phase: 'Database',
      status: 'PASS',
      message: `Connected. ${count} products in database.`,
    });
    console.log(`✅ Database OK (${count} products)\n`);
  } catch (error: any) {
    results.push({
      phase: 'Database',
      status: 'FAIL',
      message: `Failed: ${error.message}`,
    });
    console.log(`❌ Database failed\n`);
    return results;
  }

  // ============================================
  // PHASE 1: HiggsField Integration
  // ============================================
  console.log('[1/7] Testing HiggsField provider...');

  const hfConfigured = higgsfield.isHiggsFieldConfigured();
  if (hfConfigured) {
    try {
      const testResult = await higgsfield.generateImage({
        prompt: 'Professional product photo of a smartwatch on a clean desk, modern lighting, studio quality',
        aspectRatio: '9:16',
      });

      if (testResult.success && testResult.outputUrl) {
        results.push({
          phase: 'HiggsField',
          status: 'PASS',
          message: `Image generated successfully: ${testResult.outputUrl.substring(0, 60)}...`,
          details: { jobId: testResult.jobId, url: testResult.outputUrl },
        });
        console.log(`✅ HiggsField PASS - Image: ${testResult.outputUrl?.substring(0, 60)}...\n`);
      } else {
        results.push({
          phase: 'HiggsField',
          status: 'FAIL',
          message: `Generation failed: ${testResult.error}`,
        });
        console.log(`❌ HiggsField FAIL\n`);
      }
    } catch (error: any) {
      results.push({
        phase: 'HiggsField',
        status: 'FAIL',
        message: `Error: ${error.message}`,
      });
      console.log(`❌ HiggsField ERROR: ${error.message}\n`);
    }
  } else {
    results.push({
      phase: 'HiggsField',
      status: 'SKIP',
      message: 'Not configured. Add HF_KEY_ID and HF_KEY_SECRET to .env',
    });
    console.log(`⚠️ HiggsField SKIP - Not configured\n`);
  }

  // ============================================
  // PHASE 2: Pippit Integration
  // ============================================
  console.log('[2/7] Testing Pippit provider...');

  const pippitConfigured = pippit.isPippitConfigured();
  if (pippitConfigured) {
    try {
      const testResult = await pippit.generateVideo({
        prompt: 'Professional product showcase video with smooth camera movement',
        aspectRatio: '9:16',
        duration: 30,
      });

      if (testResult.success) {
        results.push({
          phase: 'Pippit',
          status: 'PASS',
          message: `Video job created: ${testResult.jobId}`,
          details: { jobId: testResult.jobId, status: testResult.status },
        });
        console.log(`✅ Pippit PASS - Job: ${testResult.jobId}\n`);
      } else {
        results.push({
          phase: 'Pippit',
          status: 'FAIL',
          message: `Failed: ${testResult.error}`,
        });
        console.log(`❌ Pippit FAIL\n`);
      }
    } catch (error: any) {
      results.push({
        phase: 'Pippit',
        status: 'FAIL',
        message: `Error: ${error.message}`,
      });
      console.log(`❌ Pippit ERROR: ${error.message}\n`);
    }
  } else {
    results.push({
      phase: 'Pippit',
      status: 'SKIP',
      message: 'Not configured. Add PIPPIT_API_KEY to .env',
    });
    console.log(`⚠️ Pippit SKIP - Not configured\n`);
  }

  // ============================================
  // PHASE 3: Storage Integration
  // ============================================
  console.log('[3/7] Testing Storage provider...');

  try {
    const storageStatus = storage.isConfigured();
    console.log(`   Provider: ${storageStatus.provider}`);
    console.log(`   Configured: ${storageStatus.configured}`);

    if (storageStatus.configured) {
      // Test storage write
      const testContent = JSON.stringify({ test: 'validation', timestamp: Date.now() });
      const uploadResult = await storage.uploadContent(testContent, 'validation_test.json');

      if (uploadResult.success) {
        results.push({
          phase: 'Storage',
          status: 'PASS',
          message: `Uploaded via ${storageStatus.provider}: ${uploadResult.url || uploadResult.path}`,
          details: { provider: storageStatus.provider, url: uploadResult.url },
        });
        console.log(`✅ Storage PASS - ${storageStatus.provider}\n`);
      } else {
        results.push({
          phase: 'Storage',
          status: 'FAIL',
          message: `Upload failed: ${uploadResult.error}`,
        });
        console.log(`❌ Storage FAIL\n`);
      }
    } else {
      results.push({
        phase: 'Storage',
        status: 'SKIP',
        message: `Provider ${storageStatus.provider} not configured`,
      });
      console.log(`⚠️ Storage SKIP\n`);
    }

    const stats = storage.getStorageStats();
    console.log(`   Temp files: ${stats.tempFiles}, Size: ${stats.tempSize} bytes`);
  } catch (error: any) {
    results.push({
      phase: 'Storage',
      status: 'FAIL',
      message: `Error: ${error.message}`,
    });
    console.log(`❌ Storage ERROR: ${error.message}\n`);
  }

  // ============================================
  // PHASE 4: Production Package Generation
  // ============================================
  console.log('[4/7] Testing Production Package generation...');

  try {
    // Find or create test content
    let testContent = await prisma.content.findFirst({
      where: { approvalStatus: 'APPROVED' },
      include: { product: true },
    });

    if (!testContent) {
      // Create minimal test content
      const testProduct = await prisma.product.create({
        data: {
          name: 'Validation Test Product',
          slug: 'validation-test-' + Date.now(),
          category: 'Test',
          price: 99000,
          commission: 10,
          commissionAmount: 9900,
          affiliatePlatform: 'Shopee',
          affiliateLink: 'https://shopee.co.id/test',
          status: 'ACTIVE',
        },
      });

      testContent = await prisma.content.create({
        data: {
          productId: testProduct.id,
          contentType: 'MIXED_CONTENT',
          platform: 'ALL',
          hook: 'Test hook for validation',
          caption: 'Test caption',
          cta: 'Klik link di bio',
          hashtags: '#test #validation',
          approvalStatus: 'APPROVED',
        },
      });

      results.push({
        phase: 'Production',
        status: 'PASS',
        message: `Created test data for validation`,
        details: { productId: testProduct.id, contentId: testContent.id },
      });
      console.log(`✅ Created test data for validation\n`);
    }

    // Generate production package
    const pkgResult = await generateProductionPackage(testContent.id);

    if (pkgResult.success && pkgResult.packageId) {
      const pkg = await prisma.productionPackage.findUnique({
        where: { id: pkgResult.packageId },
        include: {
          content: { include: { product: true } },
          renderJobs: true
        },
      });

      const productName = pkg?.content?.product?.name || 'Unknown';

      results.push({
        phase: 'Production',
        status: 'PASS',
        message: `Package generated: ${pkgResult.packageId}`,
        details: {
          packageId: pkgResult.packageId,
          product: productName,
          status: pkg?.status,
          hasVideoPrompts: !!(pkg?.videoPromptPippit || pkg?.videoPromptVeo),
          hasImagePrompts: !!(pkg?.imagePromptThumbnail),
        },
      });
      console.log(`✅ Production PASS - Package: ${pkgResult.packageId}\n`);
    } else {
      results.push({
        phase: 'Production',
        status: 'FAIL',
        message: `Generation failed: ${pkgResult.error}`,
      });
      console.log(`❌ Production FAIL\n`);
    }
  } catch (error: any) {
    results.push({
      phase: 'Production',
      status: 'FAIL',
      message: `Error: ${error.message}`,
    });
    console.log(`❌ Production ERROR: ${error.message}\n`);
  }

  // ============================================
  // PHASE 5: Render Job Creation
  // ============================================
  console.log('[5/7] Testing Render Job creation...');

  try {
    const pkg = await prisma.productionPackage.findFirst({
      orderBy: { createdAt: 'desc' },
      include: {
        content: { include: { product: true } },
        renderJobs: true
      },
    });

    if (pkg && pkg.videoPromptPippit) {
      const job = await prisma.renderJob.create({
        data: {
          productionPackageId: pkg.id,
          jobType: 'VIDEO',
          tool: 'PIPPIT',
          prompt: pkg.videoPromptPippit,
          duration: 30,
          format: '9:16',
          status: 'queued',
        },
      });

      results.push({
        phase: 'RenderJobs',
        status: 'PASS',
        message: `Render job created: ${job.id}`,
        details: { jobId: job.id, tool: job.tool, status: job.status },
      });
      console.log(`✅ RenderJobs PASS - Job: ${job.id}\n`);
    } else {
      results.push({
        phase: 'RenderJobs',
        status: 'SKIP',
        message: 'No production package with video prompts available',
      });
      console.log(`⚠️ RenderJobs SKIP\n`);
    }
  } catch (error: any) {
    results.push({
      phase: 'RenderJobs',
      status: 'FAIL',
      message: `Error: ${error.message}`,
    });
    console.log(`❌ RenderJobs ERROR: ${error.message}\n`);
  }

  // ============================================
  // PHASE 6: Provider Status
  // ============================================
  console.log('[6/7] Checking provider status...');

  try {
    const status = await getProviderStatus();
    console.log(`   Pippit: ${status.pippit.configured ? '✅' : '⚠️'} ${status.pippit.message}`);
    console.log(`   HiggsField: ${status.higgsfield.configured ? '✅' : '⚠️'} ${status.higgsfield.message}`);

    results.push({
      phase: 'Providers',
      status: status.pippit.configured || status.higgsfield.configured ? 'PASS' : 'SKIP',
      message: `Pippit: ${status.pippit.configured}, HiggsField: ${status.higgsfield.configured}`,
      details: status,
    });
    console.log('');
  } catch (error: any) {
    results.push({
      phase: 'Providers',
      status: 'FAIL',
      message: `Error: ${error.message}`,
    });
  }

  // ============================================
  // PHASE 7: Complete Flow Summary
  // ============================================
  console.log('[7/7] Generating architecture report...\n');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;

  console.log('===========================================');
  console.log('VALIDATION SUMMARY');
  console.log('===========================================');
  console.log(`✅ PASS: ${passed}`);
  console.log(`❌ FAIL: ${failed}`);
  console.log(`⚠️  SKIP: ${skipped}`);
  console.log('===========================================\n');

  return results;
}

// ============================================
// GENERATE ARCHITECTURE REPORT
// ============================================

function generateReport(results: ValidationResult[]): string {
  const pass = results.filter(r => r.status === 'PASS');
  const fail = results.filter(r => r.status === 'FAIL');
  const skip = results.filter(r => r.status === 'SKIP');

  return `
# ============================================
# PHASE 4 ARCHITECTURE VALIDATION REPORT
# ============================================

**Date:** ${new Date().toISOString()}
**Status:** ${fail.length === 0 ? '✅ VALIDATED' : '⚠️ ISSUES FOUND'}

## Integration Status

| Component | Status | Details |
|-----------|--------|---------|
${results.map(r => `| ${r.phase} | ${r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️'} ${r.status} | ${r.message} |`).join('\n')}

## Flow: Product → Content → Production → Asset → Storage

### ✅ COMPLETE (Working)
${pass.map(r => `- **${r.phase}**: ${r.message}`).join('\n')}

### ⚠️ PENDING (Not Configured)
${skip.map(r => `- **${r.phase}**: ${r.message}`).join('\n')}

${fail.length > 0 ? `### ❌ ISSUES
${fail.map(r => `- **${r.phase}**: ${r.message}`).join('\n')}
` : ''}

## Configuration Required

### HiggsField (Image/Video Generation)
\`\`\`
HF_KEY_ID="your-key-id"
HF_KEY_SECRET="your-key-secret"
\`\`\`
Get from: https://platform.higgsfield.ai

### Pippit (Video Generation - OPTION 1)
\`\`\`
PIPPIT_API_KEY="your-api-key"
\`\`\`

### Cloud Storage (Google Drive or Dropbox)
\`\`\`
STORAGE_PROVIDER=GOOGLE_DRIVE
GOOGLE_ACCESS_TOKEN="your-token"
GOOGLE_DRIVE_FOLDER_ID="your-folder-id"

# OR
STORAGE_PROVIDER=DROPBOX
DROPBOX_ACCESS_TOKEN="your-token"
\`\`\`

## Ready for Zernio

The following flows are validated and ready:
${results.filter(r => r.status === 'PASS').map(r => `- ${r.phase}`).join('\n')}

## Next Steps

1. Configure HiggsField for video/image generation
2. Configure Pippit for alternative video generation (OPTION 1)
3. Configure cloud storage (Google Drive/Dropbox) for asset delivery
4. Test complete E2E with real product data

---
Generated by Phase 4 E2E Validation
`;
}

// ============================================
// MAIN
// ============================================

async function main() {
  try {
    const results = await runValidation();
    const report = generateReport(results);

    console.log(report);

    // Save report to file
    const fs = await import('fs');
    fs.writeFileSync('./validation-report.md', report);
    console.log('\n📄 Report saved to: validation-report.md');

    // Exit with error if critical failures
    const criticalFails = results.filter(r =>
      r.status === 'FAIL' &&
      ['Database', 'Production', 'RenderJobs'].includes(r.phase)
    );

    if (criticalFails.length > 0) {
      console.log('\n❌ Critical failures detected. Fix before proceeding to Phase 5.');
      process.exit(1);
    }

    console.log('\n✅ Phase 4 validation complete.');
  } catch (error: any) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();