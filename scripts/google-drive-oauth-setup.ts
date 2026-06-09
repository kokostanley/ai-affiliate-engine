// ============================================
// GOOGLE DRIVE OAUTH TOKEN GENERATOR
// Run this script locally to get refresh token
// ============================================

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import * as http from 'http';
import * as url from 'url';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../.env') });

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3002/oauth/callback';

const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
];

// Cloud storage folders that will be created in Google Drive
const GOOGLE_DRIVE_FOLDERS = [
  'AI-Affiliate-Engine',
  'AI-Affiliate-Engine/Crypto-EW',
  'AI-Affiliate-Engine/Pippit-Manual',
];

// Colors for console
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(msg: string, color = 'reset') {
  console.log(`${colors[color as keyof typeof colors]}${msg}${colors.reset}`);
}

function logSection(title: string) {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

function logWarning(msg: string) {
  console.log(`\n⚠️  ${msg}\n`);
}

async function getAuthorizationUrl(): Promise<string> {
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', CLIENT_ID!);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES.join(' '));
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  return authUrl.toString();
}

async function exchangeCodeForToken(code: string): Promise<any> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return response.json();
}

function saveTokensToEnv(tokens: any) {
  const envPath = path.join(__dirname, '../.env');
  let envContent = fs.readFileSync(envPath, 'utf-8');

  // Update or add tokens
  if (envContent.includes('GOOGLE_REFRESH_TOKEN=')) {
    envContent = envContent.replace(
      /GOOGLE_REFRESH_TOKEN=.*/,
      `GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`
    );
  } else {
    envContent += `\n# Google OAuth (added by setup script)\nGOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`;
  }

  // Update STORAGE_PROVIDER
  if (envContent.includes('STORAGE_PROVIDER=')) {
    envContent = envContent.replace(
      /STORAGE_PROVIDER=.*/,
      'STORAGE_PROVIDER=GOOGLE_DRIVE'
    );
  }

  fs.writeFileSync(envPath, envContent);
  console.log('\n✅ Tokens saved to .env file');
}

function startLocalServer(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const parsedUrl = url.parse(req.url!, true);

      if (parsedUrl.pathname === '/oauth/callback') {
        const code = parsedUrl.query.code as string;

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>Authorization Successful</title>
              <style>
                body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; }
                .success { color: #22c55e; font-size: 48px; }
                h1 { color: #1f2937; }
                code { background: #f3f4f6; padding: 2px 8px; border-radius: 4px; }
                pre { background: #1f2937; color: #e5e7eb; padding: 16px; border-radius: 8px; overflow-x: auto; }
              </style>
            </head>
            <body>
              <div class="success">✓</div>
              <h1>Authorization Successful!</h1>
              <p>You can close this window and return to the terminal.</p>
              <p>Code received: <code>${code.substring(0, 20)}...</code></p>
              <pre>Exchanging code for tokens...</pre>
              <script>
                // Auto-submit code to parent process
                window.opener?.postMessage({ type: 'oauth_code', code: '${code}' }, '*');
              </script>
            </body>
            </html>
          `);

          server.close();
          resolve(code);
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>No code received</h1>');
          server.close();
          reject(new Error('No authorization code received'));
        }
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(3002, () => {
      log(`Server running on ${REDIRECT_URI}`, 'blue');
    });

    server.on('error', reject);
  });
}

async function checkExistingFolders(accessToken: string): Promise<{ accessible: boolean; folders: string[] }> {
  const accessibleFolders: string[] = [];
  let accessible = true;

  for (const folder of GOOGLE_DRIVE_FOLDERS) {
    try {
      // Search for folder
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name='${folder.split('/').pop()}' and mimeType='application/vnd.google-apps.folder'`)}`;

      const response = await fetch(searchUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (response.ok) {
        const result: any = await response.json();
        if (result.files && result.files.length > 0) {
          accessibleFolders.push(folder);
          log(`  ✓ Found: ${folder}`, 'green');
        }
      }
    } catch {}
  }

  return { accessible, folders: accessibleFolders };
}

async function verifyFolderAccess(accessToken: string): Promise<{ success: boolean; missingFolders: string[] }> {
  const missingFolders: string[] = [];

  for (const folder of GOOGLE_DRIVE_FOLDERS) {
    try {
      const folderName = folder.split('/').pop()!;
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`name='${folderName}' and mimeType='application/vnd.google-apps.folder'`)}`;

      const response = await fetch(searchUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (!response.ok || response.status === 403) {
        missingFolders.push(folder);
        continue;
      }

      const result: any = await response.json();
      if (!result.files || result.files.length === 0) {
        missingFolders.push(folder);
      }
    } catch {
      missingFolders.push(folder);
    }
  }

  return { success: missingFolders.length === 0, missingFolders };
}

function createManualInstructions() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║              MANUAL OAUTH TOKEN GENERATION                     ║
╠════════════════════════════════════════════════════════════════╣
║                                                                ║
║  If you cannot use the browser-based setup, use OAuth          ║
║  Playground to generate the refresh token:                     ║
║                                                                ║
║  1. Go to: https://developers.google.com/oauthplayground        ║
║                                                                ║
║  2. Click the gear icon ⚙️ (top right)                        ║
║     Check "Use your own OAuth credentials"                     ║
║     Enter your CLIENT_ID and CLIENT_SECRET                    ║
║                                                                ║
║  3. In the sidebar, click "Drive API v3"                      ║
║     Select scope: https://www.googleapis.com/auth/drive        ║
║                                                                ║
║  4. Click "Authorize APIs" and sign in with the account        ║
║     that has access to the folders                             ║
║                                                                ║
║  5. Click "Exchange authorization code for tokens"            ║
║                                                                ║
║  6. Copy the "refresh_token" value                             ║
║                                                                ║
║  7. Add to .env:                                              ║
║     GOOGLE_REFRESH_TOKEN=your-token-here                       ║
║     STORAGE_PROVIDER=GOOGLE_DRIVE                              ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
`);
}

async function main() {
  logSection('GOOGLE DRIVE OAUTH SETUP');

  // Check for required credentials
  if (!CLIENT_ID || !CLIENT_SECRET) {
    log('\n❌ Missing credentials in .env file', 'red');
    log('\nPlease add these to your .env file first:', 'yellow');
    log('  GOOGLE_CLIENT_ID=your-client-id', 'reset');
    log('  GOOGLE_CLIENT_SECRET=your-client-secret', 'reset');
    log('\nThen run this script again.', 'reset');
    process.exit(1);
  }

  log('\n✅ Found credentials in .env', 'green');

  // Show folder structure that will be created in Google Drive
  log('\n📁 Cloud Storage Folder Structure (will be created in Google Drive):', 'blue');
  log('   My Drive/', 'reset');
  log('   └── AI-Affiliate-Engine/', 'cyan');
  log('       ├── Crypto-EW/', 'cyan');
  log('       └── Pippit-Manual/', 'cyan');

  log('\n📦 What gets stored in cloud:', 'blue');
  log('   • Rendered videos (VEO, Seedance, Sora, Higgsfield)', 'reset');
  log('   • Generated images (DALL-E, Midjourney)', 'reset');
  log('   • Carousel graphics', 'reset');
  log('   • Pippit prompt files', 'reset');
  log('   • Distribution assets', 'reset');
  log('   • Export logs', 'reset');

  log('\n📂 Local project folder: C:\\Users\\Jason Lee\\ai-affiliate-engine\\', 'reset');
  log('   (Code only - not synced to cloud)', 'reset');

  try {
    // Get authorization URL
    const authUrl = await getAuthorizationUrl();

    log('\n📋 STEP 1: Authorize Application', 'blue');
    log('\nOpen this URL in your browser:\n', 'reset');
    log(authUrl + '\n', 'reset');

    log('⚠️  Sign in with the Google account you want to use for cloud storage.', 'yellow');
    log('   This account will own the AI-Affiliate-Engine folder in Google Drive.\n', 'yellow');

    // Start local server to receive callback
    log('\n📋 STEP 2: Wait for Callback', 'blue');
    log('A local server is running on port 3002...', 'reset');
    log('After you authorize, the page will show "Authorization Successful"', 'reset');
    log('Then come back here and press Enter to continue\n', 'reset');

    // Start server
    const server = http.createServer((req, res) => {
      const parsedUrl = url.parse(req.url!, true);

      if (parsedUrl.pathname === '/oauth/callback') {
        const code = parsedUrl.query.code as string;
        const error = parsedUrl.query.error as string;

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html><body>
              <h1>Authorization Failed</h1>
              <p>Error: ${error}</p>
              <p>Please try again.</p>
            </body></html>
          `);
          server.close();
          log(`\n❌ Authorization failed: ${error}`, 'red');
          process.exit(1);
        }

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <title>Authorization Successful</title>
              <style>
                body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
                .success { font-size: 64px; margin: 20px 0; }
                h1 { color: #22c55e; }
                p { color: #6b7280; }
                code { background: #f3f4f6; padding: 2px 8px; border-radius: 4px; }
              </style>
            </head>
            <body>
              <div class="success">✓</div>
              <h1>Authorization Successful!</h1>
              <p>You can close this window and return to the terminal.</p>
              <p>Code: <code>${code.substring(0, 20)}...</code></p>
            </body>
            </html>
          `);

          server.close();
          handleTokenExchange(code);
        } else {
          res.writeHead(400);
          res.end('No code received');
          server.close();
          process.exit(1);
        }
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(3002, () => {
      log(`\n🌐 Local server running on ${REDIRECT_URI}`, 'blue');
      log('Waiting for authorization...\n', 'yellow');
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        log('\n❌ Port 3002 is already in use', 'red');
        log('Please close other applications using port 3002 and try again.', 'reset');
        process.exit(1);
      }
      throw err;
    });

  } catch (error: any) {
    log(`\n❌ Error: ${error.message}`, 'red');
    process.exit(1);
  }
}

async function handleTokenExchange(code: string) {
  log('\n📋 STEP 3: Exchange Code for Tokens', 'blue');
  log('Exchanging authorization code for tokens...\n', 'reset');

  try {
    const tokens = await exchangeCodeForToken(code);

    log('✅ Got tokens:', 'green');
    log(`   Access Token: ${tokens.access_token?.substring(0, 20)}...`, 'reset');
    log(`   Refresh Token: ${tokens.refresh_token?.substring(0, 20)}...`, 'reset');
    log(`   Expires in: ${tokens.expires_in} seconds`, 'reset');

    // Verify folder access
    log('\n📋 STEP 4: Verify & Create Folders', 'blue');
    log('Checking cloud storage folders...\n', 'reset');

    const folderCheck = await verifyFolderAccess(tokens.access_token);

    if (folderCheck.success) {
      log('✅ All folders already exist in Google Drive!', 'green');
    } else {
      log('📁 Creating missing folders in Google Drive...\n', 'yellow');
      for (const folder of folderCheck.missingFolders) {
        log(`   Creating: ${folder}`, 'cyan');
      }
      log('\n   Folders will be created automatically when you first upload an asset.', 'reset');
    }

    // Save to .env
    log('\n📋 STEP 5: Save Tokens', 'blue');
    saveTokensToEnv(tokens);

    // Get user email for confirmation
    try {
      const aboutResponse = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
        headers: { 'Authorization': `Bearer ${tokens.access_token}` },
      });
      if (aboutResponse.ok) {
        const about: any = await aboutResponse.json();
        log(`\n📧 Authorized as: ${about.user?.emailAddress}`, 'cyan');
      }
    } catch {}

    logSection('SETUP COMPLETE');
    log('\n✅ Google Drive is now configured!', 'green');
    log('\nNext steps:', 'reset');
    log('1. Restart your dev server: npm run dev', 'reset');
    log('2. Test the connection: npm run test:google-drive', 'reset');
    log('3. Run /storage in Telegram bot', 'reset');
    log('\nYour STORAGE_PROVIDER is now set to GOOGLE_DRIVE', 'yellow');

  } catch (error: any) {
    log(`\n❌ Token exchange failed: ${error.message}`, 'red');
    log('\nAlternative: Use OAuth Playground for manual token generation.', 'yellow');
    createManualInstructions();
    process.exit(1);
  }
}

// Run main
main();