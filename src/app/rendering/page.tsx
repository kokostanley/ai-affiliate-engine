'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { Play, RefreshCw, Eye, X, Clock, CheckCircle, AlertCircle, Video, Image as ImageIcon, Copy, ExternalLink } from 'lucide-react';

const API_BASE = 'http://localhost:3001';

interface RenderStats {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  failed: number;
}

interface RenderJob {
  id: string;
  jobType: string;
  tool: string;
  status: string;
  prompt: string;
  outputUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  format?: string;
  errorMessage?: string;
  retryCount: number;
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
  productionPackage?: {
    product?: {
      name: string;
    };
  };
}

interface ProductionPackage {
  id: string;
  product?: { name: string };
  videoPromptPippit?: string;
  videoPromptVeo?: string;
  videoPromptSeedance?: string;
  videoPromptSora?: string;
  imagePromptThumbnail?: string;
  imagePromptSocial?: string;
  imagePromptCarousel?: string;
  imagePromptAd?: string;
}

export default function RenderingPage() {
  const [jobs, setJobs] = useState<RenderJob[]>([]);
  const [packages, setPackages] = useState<ProductionPackage[]>([]);
  const [stats, setStats] = useState<RenderStats>({ total: 0, queued: 0, processing: 0, completed: 0, failed: 0 });
  const [loading, setLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<RenderJob | null>(null);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetchJobs();
    fetchPackages();
  }, []);

  const fetchJobs = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/rendering`);
      const data = await res.json();
      if (data.success) {
        setJobs(data.data.jobs);
        setStats(data.data.stats);
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
    }
  };

  const fetchPackages = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/production`);
      const data = await res.json();
      if (data.success) {
        setPackages(data.data.packages.filter((p: any) => p.status === 'production_ready'));
      }
    } catch (error) {
      console.error('Error fetching packages:', error);
    }
  };

  const createBatchJobs = async (packageId: string, tools: string[]) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/rendering/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productionPackageId: packageId,
          videoTools: tools.filter(t => ['PIPPIT', 'VEO', 'SEEDANCE', 'SORA'].includes(t)),
          imageTools: tools.filter(t => ['DALL_E', 'MIDJOURNEY', 'STABLE_DIFFUSION'].includes(t)),
        }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchJobs();
      }
    } catch (error) {
      console.error('Error creating jobs:', error);
    }
    setLoading(false);
  };

  const updateStatus = async (jobId: string, status: string, outputUrl?: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/rendering/${jobId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, outputUrl }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchJobs();
        if (selectedJob?.id === jobId) {
          setSelectedJob(data.data);
        }
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const retryJob = async (jobId: string) => {
    try {
      await fetch(`${API_BASE}/api/rendering/${jobId}/retry`, { method: 'POST' });
      await fetchJobs();
    } catch (error) {
      console.error('Error retrying job:', error);
    }
  };

  const cancelJob = async (jobId: string) => {
    try {
      await fetch(`${API_BASE}/api/rendering/${jobId}/cancel`, { method: 'POST' });
      await fetchJobs();
      setSelectedJob(null);
    } catch (error) {
      console.error('Error cancelling job:', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const statusColors: Record<string, string> = {
    queued: 'bg-yellow-400/20 text-yellow-400',
    processing: 'bg-blue-400/20 text-blue-400',
    completed: 'bg-green-400/20 text-green-400',
    failed: 'bg-red-400/20 text-red-400',
  };

  const statusLabels: Record<string, string> = {
    queued: 'Queued',
    processing: 'Processing',
    completed: 'Completed',
    failed: 'Failed',
  };

  const toolIcons: Record<string, JSX.Element> = {
    PIPPIT: <Video className="h-4 w-4" />,
    VEO: <Video className="h-4 w-4" />,
    SEEDANCE: <Video className="h-4 w-4" />,
    SORA: <Video className="h-4 w-4" />,
    DALL_E: <ImageIcon className="h-4 w-4" />,
    MIDJOURNEY: <ImageIcon className="h-4 w-4" />,
    STABLE_DIFFUSION: <ImageIcon className="h-4 w-4" />,
  };

  const filteredJobs = filter === 'all' ? jobs : jobs.filter(j => j.status === filter);

  return (
    <div className="min-h-screen bg-[#0a0f1a]">
      <Header title="Rendering Hub" description="Video & Image Generation Queue" />

      <div className="p-6 space-y-6">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-4">
            <p className="text-2xl font-bold text-white">{stats.total}</p>
            <p className="text-sm text-gray-400">Total</p>
          </div>
          <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-4">
            <p className="text-2xl font-bold text-yellow-400">{stats.queued}</p>
            <p className="text-sm text-gray-400">Queued</p>
          </div>
          <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-4">
            <p className="text-2xl font-bold text-blue-400">{stats.processing}</p>
            <p className="text-sm text-gray-400">Processing</p>
          </div>
          <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-4">
            <p className="text-2xl font-bold text-green-400">{stats.completed}</p>
            <p className="text-sm text-gray-400">Completed</p>
          </div>
          <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-4">
            <p className="text-2xl font-bold text-red-400">{stats.failed}</p>
            <p className="text-sm text-gray-400">Failed</p>
          </div>
        </div>

        {/* Create New Jobs */}
        <div className="bg-[#0f172a] border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Create Render Jobs</h2>
          <p className="text-gray-400 text-sm mb-4">Select a production package to create render jobs:</p>
          <div className="space-y-3">
            {packages.length === 0 ? (
              <p className="text-gray-500">No production packages ready. Create packages in Production Hub first.</p>
            ) : (
              packages.map((pkg) => {
                const hasVideo = pkg.videoPromptPippit || pkg.videoPromptVeo || pkg.videoPromptSeedance || pkg.videoPromptSora;
                const hasImage = pkg.imagePromptThumbnail || pkg.imagePromptSocial || pkg.imagePromptCarousel || pkg.imagePromptAd;

                return (
                  <div key={pkg.id} className="bg-[#1a2332] rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium">{pkg.product?.name || 'Unknown'}</p>
                      <div className="flex gap-3 mt-1 text-xs text-gray-400">
                        {hasVideo && <span className="flex items-center gap-1"><Video className="h-3 w-3" /> Video</span>}
                        {hasImage && <span className="flex items-center gap-1"><ImageIcon className="h-3 w-3" /> Image</span>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => createBatchJobs(pkg.id, ['PIPPIT', 'DALL_E'])}
                        disabled={loading}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                      >
                        <Play className="h-4 w-4" />
                        Render (Quick)
                      </button>
                      <button
                        onClick={() => createBatchJobs(pkg.id, ['PIPPIT', 'VEO', 'SEEDANCE', 'SORA', 'DALL_E'])}
                        disabled={loading}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                      >
                        <Play className="h-4 w-4" />
                        Render All
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="bg-[#0f172a] border border-gray-800 rounded-xl overflow-hidden">
          <div className="border-b border-gray-800">
            <div className="flex overflow-x-auto">
              {['all', 'queued', 'processing', 'completed', 'failed'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-6 py-4 text-sm font-medium border-b-2 whitespace-nowrap ${
                    filter === f ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-white'
                  }`}
                >
                  {f === 'all' ? 'All' : statusLabels[f]}
                  <span className="ml-2 text-xs">
                    ({f === 'all' ? jobs.length : jobs.filter(j => j.status === f).length})
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-6">
            {/* Jobs List */}
            <div className="space-y-3">
              {filteredJobs.length === 0 ? (
                <p className="text-gray-400 py-8 text-center">No render jobs</p>
              ) : (
                filteredJobs.map((job) => (
                  <div
                    key={job.id}
                    onClick={() => setSelectedJob(job)}
                    className={`bg-[#1a2332] rounded-lg p-4 cursor-pointer border transition-all ${
                      selectedJob?.id === job.id ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-700 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${job.jobType === 'VIDEO' ? 'bg-blue-400/10 text-blue-400' : 'bg-purple-400/10 text-purple-400'}`}>
                          {job.jobType === 'VIDEO' ? <Video className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[job.status]}`}>
                              {statusLabels[job.status]}
                            </span>
                            <span className="text-white font-medium">{job.tool}</span>
                          </div>
                          <p className="text-sm text-gray-400 mt-1">
                            {job.productionPackage?.product?.name || 'Unknown'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          {job.duration && <p className="text-sm text-gray-400">{job.duration}s</p>}
                          {job.format && <p className="text-xs text-gray-500">{job.format}</p>}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedJob(job); }}
                          className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
                        >
                          <Eye className="h-4 w-4 text-gray-400" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Job Detail Modal */}
        {selectedJob && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-[#0f172a] border border-gray-800 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-800 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    {selectedJob.jobType === 'VIDEO' ? <Video className="h-5 w-5 text-blue-400" /> : <ImageIcon className="h-5 w-5 text-purple-400" />}
                    {selectedJob.tool} Render
                  </h3>
                  <p className="text-sm text-gray-400">{selectedJob.productionPackage?.product?.name}</p>
                </div>
                <button onClick={() => setSelectedJob(null)} className="p-2 hover:bg-gray-800 rounded-lg">
                  <X className="h-5 w-5 text-gray-400" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* Status */}
                <div className="flex items-center justify-between">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[selectedJob.status]}`}>
                    {statusLabels[selectedJob.status]}
                  </span>
                  {selectedJob.retryCount > 0 && (
                    <span className="text-xs text-gray-500">Retry: {selectedJob.retryCount}/3</span>
                  )}
                </div>

                {/* Preview */}
                {selectedJob.status === 'completed' && selectedJob.outputUrl && (
                  <div className="bg-[#1a2332] rounded-lg p-4">
                    <p className="text-sm text-gray-400 mb-2">Output</p>
                    {selectedJob.jobType === 'VIDEO' ? (
                      <video src={selectedJob.outputUrl} controls className="w-full rounded-lg" />
                    ) : (
                      <img src={selectedJob.outputUrl} alt="Output" className="w-full rounded-lg" />
                    )}
                  </div>
                )}

                {/* Prompt */}
                <div className="bg-[#1a2332] rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-gray-400">Prompt</p>
                    <button
                      onClick={() => copyToClipboard(selectedJob.prompt)}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-white text-sm whitespace-pre-wrap">{selectedJob.prompt}</p>
                </div>

                {/* Output URL */}
                {selectedJob.outputUrl && (
                  <div className="bg-[#1a2332] rounded-lg p-4">
                    <p className="text-sm text-gray-400 mb-2">Output URL</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={selectedJob.outputUrl}
                        readOnly
                        className="flex-1 bg-[#0f172a] border border-gray-700 rounded px-3 py-2 text-white text-sm"
                      />
                      <a
                        href={selectedJob.outputUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                )}

                {/* Error */}
                {selectedJob.status === 'failed' && selectedJob.errorMessage && (
                  <div className="bg-red-400/10 border border-red-400/20 rounded-lg p-4">
                    <p className="text-sm text-red-400">{selectedJob.errorMessage}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-4">
                  {selectedJob.status === 'queued' && (
                    <button
                      onClick={() => updateStatus(selectedJob.id, 'processing')}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2"
                    >
                      <Play className="h-4 w-4" />
                      Start Processing
                    </button>
                  )}
                  {selectedJob.status === 'processing' && (
                    <>
                      <button
                        onClick={() => updateStatus(selectedJob.id, 'completed', 'https://example.com/output.mp4')}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium flex items-center gap-2"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Mark Complete
                      </button>
                      <button
                        onClick={() => updateStatus(selectedJob.id, 'failed', undefined)}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium flex items-center gap-2"
                      >
                        <AlertCircle className="h-4 w-4" />
                        Mark Failed
                      </button>
                    </>
                  )}
                  {selectedJob.status === 'failed' && (
                    <button
                      onClick={() => retryJob(selectedJob.id)}
                      className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium flex items-center gap-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Retry
                    </button>
                  )}
                  <button
                    onClick={() => cancelJob(selectedJob.id)}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium flex items-center gap-2"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </button>
                </div>

                {/* Metadata */}
                <div className="pt-4 border-t border-gray-800 text-xs text-gray-500 space-y-1">
                  <p>Created: {new Date(selectedJob.queuedAt).toLocaleString()}</p>
                  {selectedJob.startedAt && <p>Started: {new Date(selectedJob.startedAt).toLocaleString()}</p>}
                  {selectedJob.completedAt && <p>Completed: {new Date(selectedJob.completedAt).toLocaleString()}</p>}
                  <p>ID: {selectedJob.id}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}