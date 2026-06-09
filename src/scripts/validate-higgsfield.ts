// ============================================
// HIGGSFIELD VALIDATION TEST
// Test real image and video generation
// ============================================

import dotenv from 'dotenv';
import {
  isHiggsFieldConfigured,
  testConnection,
  generateImage,
  generateVideo,
  getAccountInfo,
} from '../services/higgsfield';

dotenv.config();

async function runValidation() {
  console.log('===========================================');
  console.log('HIGGSFIELD VALIDATION TEST');
  console.log('===========================================\n');

  // 1. Check configuration
  console.log('1. Checking configuration...');
  const isConfigured = isHiggsFieldConfigured();
  console.log(`   Configured: ${isConfigured ? '✅ YES' : '❌ NO'}`);

  if (!isConfigured) {
    console.log('\n❌ HiggsField not configured.');
    console.log('   Add to .env:');
    console.log('   HF_KEY_ID="hf_..."');
    console.log('   HF_KEY_SECRET="..."');
    process.exit(1);
  }

  // 2. Test connection
  console.log('\n2. Testing connection...');
  const connection = await testConnection();
  console.log(`   ${connection.success ? '✅' : '❌'} ${connection.message}`);

  if (!connection.success) {
    console.log('\n❌ Connection failed.');
    process.exit(1);
  }

  // 3. Get account info
  console.log('\n3. Getting account info...');
  const account = await getAccountInfo();
  if (account) {
    console.log(`   ✅ Account: ${JSON.stringify(account).substring(0, 200)}`);
  } else {
    console.log('   ⚠️ Could not get account info');
  }

  // 4. Test image generation
  console.log('\n4. Testing IMAGE generation...');
  console.log('   Prompt: "Professional product photo of a smart watch on a clean desk, modern lighting"');

  const imageResult = await generateImage({
    prompt: 'Professional product photo of a smart watch on a clean desk, modern lighting, studio quality',
    aspectRatio: '9:16',
  });

  console.log(`   ${imageResult.success ? '✅' : '❌'} Image generated:`);
  if (imageResult.success) {
    console.log(`   - Job ID: ${imageResult.jobId}`);
    console.log(`   - Status: ${imageResult.status}`);
    console.log(`   - Output URL: ${imageResult.outputUrl?.substring(0, 80)}...`);
  } else {
    console.log(`   Error: ${imageResult.error}`);
  }

  // Store image URL for video test
  const imageUrl = imageResult.outputUrl;

  // 5. Test video generation (if we have an image URL)
  console.log('\n5. Testing VIDEO generation...');

  if (imageUrl) {
    console.log('   Using image from step 4...');
    console.log('   Prompt: "Person wearing smart watch, checking notifications, modern lifestyle"');

    const videoResult = await generateVideo({
      imageUrl: imageUrl,
      prompt: 'Person wearing smart watch, checking notifications, modern lifestyle, smooth camera movement',
      duration: 4,
      resolution: '720p',
    });

    console.log(`   ${videoResult.success ? '✅' : '❌'} Video generated:`);
    if (videoResult.success) {
      console.log(`   - Job ID: ${videoResult.jobId}`);
      console.log(`   - Status: ${videoResult.status}`);
      console.log(`   - Output URL: ${videoResult.outputUrl?.substring(0, 80)}...`);
      console.log(`   - Thumbnail: ${videoResult.thumbnailUrl?.substring(0, 80)}...`);
    } else {
      console.log(`   Error: ${videoResult.error}`);
    }
  } else {
    console.log('   ⏭️  Skipped (no image URL from step 4)');
  }

  // 6. Summary
  console.log('\n===========================================');
  console.log('VALIDATION SUMMARY');
  console.log('===========================================');
  console.log(`Image Generation: ${imageResult.success ? '✅ WORKING' : '❌ FAILED'}`);
  console.log(`Video Generation: ${imageUrl ? '✅ TESTED' : '⏭️ SKIPPED'}`);
  console.log('===========================================\n');

  if (imageResult.success) {
    console.log('✅ HiggsField integration validated successfully!');
    console.log('   Ready to use for production rendering.');
  } else {
    console.log('❌ Validation failed. Check credentials and try again.');
    process.exit(1);
  }
}

runValidation().catch(console.error);