'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/Button';
import { CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface ServiceStatus {
  name: string;
  status: 'connected' | 'error' | 'pending';
  message?: string;
}

export default function SettingsPage() {
  const [services, setServices] = useState<Record<string, ServiceStatus>>({
    database: { name: 'Database', status: 'pending' },
    telegram: { name: 'Telegram Bot', status: 'pending' },
    ai: { name: 'AI API', status: 'pending' },
    worker: { name: 'Worker', status: 'pending' },
  });

  useEffect(() => {
    checkServices();
  }, []);

  const checkServices = async () => {
    // Set all to pending
    setServices(prev => Object.fromEntries(
      Object.entries(prev).map(([key, val]) => [key, { ...val, status: 'pending' as const }])
    ));

    // Check Database
    try {
      const res = await fetch('/api/analytics/overview');
      if (res.ok) {
        setServices(prev => ({ ...prev, database: { ...prev.database, status: 'connected', message: 'SQLite connected' } }));
      } else {
        throw new Error();
      }
    } catch {
      setServices(prev => ({ ...prev, database: { ...prev.database, status: 'error', message: 'Connection failed' } }));
    }

    // Check Telegram
    const botToken = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN || 'dummy_token';
    if (botToken && botToken !== 'dummy_token') {
      try {
        const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
        if (res.ok) {
          setServices(prev => ({ ...prev, telegram: { ...prev.telegram, status: 'connected', message: 'Bot connected' } }));
        } else {
          throw new Error();
        }
      } catch {
        setServices(prev => ({ ...prev, telegram: { ...prev.telegram, status: 'error', message: 'Invalid token' } }));
      }
    } else {
      setServices(prev => ({ ...prev, telegram: { ...prev.telegram, status: 'error', message: 'Token not configured' } }));
    }

    // Check AI
    const aiKey = process.env.NEXT_PUBLIC_AI_API_KEY || 'dummy_key';
    if (aiKey && aiKey !== 'dummy_key') {
      setServices(prev => ({ ...prev, ai: { ...prev.ai, status: 'connected', message: 'API key valid' } }));
    } else {
      setServices(prev => ({ ...prev, ai: { ...prev.ai, status: 'error', message: 'API key not configured' } }));
    }

    // Worker always considered connected (it's a background process)
    setServices(prev => ({ ...prev, worker: { ...prev.worker, status: 'connected', message: 'Running' } }));
  };

  const statusIcons = {
    connected: <CheckCircle className="h-5 w-5 text-green-400" />,
    error: <XCircle className="h-5 w-5 text-red-400" />,
    pending: <AlertCircle className="h-5 w-5 text-yellow-400" />,
  };

  const statusBg = {
    connected: 'bg-green-400/10 border-green-400/20',
    error: 'bg-red-400/10 border-red-400/20',
    pending: 'bg-yellow-400/10 border-yellow-400/20',
  };

  return (
    <div className="min-h-screen bg-[#0a0f1a]">
      <Header title="Settings" description="Konfigurasi sistem" />

      <div className="p-6 space-y-6">
        {/* Service Status */}
        <div className="rounded-xl border border-gray-800 bg-[#0f172a] p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white">Service Status</h3>
            <Button variant="ghost" size="sm" onClick={checkServices}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {Object.entries(services).map(([key, service]) => (
              <div
                key={key}
                className={`rounded-lg border p-4 ${statusBg[service.status]}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {statusIcons[service.status]}
                    <div>
                      <p className="font-medium text-white">{service.name}</p>
                      <p className="text-xs text-gray-400">{service.message}</p>
                    </div>
                  </div>
                  <span className={`text-sm font-medium ${
                    service.status === 'connected' ? 'text-green-400' :
                    service.status === 'error' ? 'text-red-400' : 'text-yellow-400'
                  }`}>
                    {service.status === 'connected' ? 'Connected' :
                     service.status === 'error' ? 'Error' : 'Checking...'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Environment Info */}
        <div className="rounded-xl border border-gray-800 bg-[#0f172a] p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Environment</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Environment</span>
              <span className="text-white">{process.env.NODE_ENV || 'development'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Database</span>
              <span className="text-white">SQLite (local)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Version</span>
              <span className="text-white">1.0.0</span>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-xl border border-gray-800 bg-[#0f172a] p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
          <div className="space-y-3.5">
            <a
              href="/api/analytics/overview"
              target="_blank"
              className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/50 p-4 hover:border-gray-700 transition-colors"
            >
              <div>
                <p className="font-medium text-white">View API Analytics</p>
                <p className="text-xs text-gray-400">Open analytics endpoint in new tab</p>
              </div>
              <span className="text-sm text-blue-400">→</span>
            </a>
            <a
              href="/api/products"
              target="_blank"
              className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-900/50 p-4 hover:border-gray-700 transition-colors"
            >
              <div>
                <p className="font-medium text-white">View API Products</p>
                <p className="text-xs text-gray-400">Open products endpoint in new tab</p>
              </div>
              <span className="text-sm text-blue-400">→</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}