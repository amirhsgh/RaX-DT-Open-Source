import React, { useState, useEffect, useCallback } from 'react';
import apiService from '../services/apiService';
import { message } from '../utils/toast';
import { cn } from '../utils/cn';
import {
  Play,
  StopCircle,
  Download,
  History,
  RefreshCw,
  Info,
  Search,
  AlertTriangle,
  CheckSquare,
  Square,
  Rocket,
  RotateCcw,
} from 'lucide-react';

const STALE_HEARTBEAT_MINUTES = 5;

const isResumable = (run) => {
  if (!run) return false;
  if (['failed', 'cancelled'].includes(run.status)) return true;
  if (run.status === 'running') {
    if (!run.last_heartbeat) return false; // just started, hasn't ticked yet
    const ageMs = Date.now() - new Date(run.last_heartbeat).getTime();
    return ageMs > STALE_HEARTBEAT_MINUTES * 60 * 1000;
  }
  return false;
};

const STATUS_STYLES = {
  pending: 'bg-muted text-muted-foreground',
  running: 'bg-primary/10 text-primary',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-destructive/10 text-destructive',
  cancelled: 'bg-yellow-100 text-yellow-800',
};

const fmt = (value, digits = 3) =>
  value === null || value === undefined ? '—' : Number(value).toFixed(digits);

const StatusBadge = ({ status }) => (
  <span className={cn('inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize', STATUS_STYLES[status] || 'bg-muted text-muted-foreground')}>
    {status}
  </span>
);

const Card = ({ title, extra, children, className }) => (
  <div className={cn('bg-card text-card-foreground border border-border rounded-lg shadow-sm mb-6', className)}>
    {(title || extra) && (
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        {title && <h3 className="text-base font-semibold">{title}</h3>}
        {extra}
      </div>
    )}
    <div className="p-5">{children}</div>
  </div>
);

const Benchmark = () => {
  const [presets, setPresets] = useState({});
  const [targets, setTargets] = useState([]);
  const [runs, setRuns] = useState([]);

  const [runName, setRunName] = useState('');
  const [selectedTargets, setSelectedTargets] = useState([]);
  const [targetFilter, setTargetFilter] = useState('');
  const [maxActives, setMaxActives] = useState('');
  const [maxDecoys, setMaxDecoys] = useState('');
  const [rankBy, setRankBy] = useState('both');

  const [currentRunId, setCurrentRunId] = useState(null);
  const [currentRun, setCurrentRun] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(true);

  // Redocking (pose-accuracy / RMSD) - a separate validation from the
  // enrichment benchmark above (single ligand pose accuracy vs ranking many
  // compounds), so it gets its own run state rather than being folded in.
  const [redockingDefaults, setRedockingDefaults] = useState({ pdb_ids: [], rmsd_threshold: 2.0 });
  const [redockingPdbIdsInput, setRedockingPdbIdsInput] = useState('');
  const [redockingRuns, setRedockingRuns] = useState([]);
  const [currentRedockingRunId, setCurrentRedockingRunId] = useState(null);
  const [currentRedockingRun, setCurrentRedockingRun] = useState(null);
  const [redockingSubmitting, setRedockingSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [presetsRes, targetsRes, runsRes, redockingDefaultsRes, redockingRunsRes] = await Promise.all([
          apiService.getBenchmarkPresets(),
          apiService.getBenchmarkTargets(),
          apiService.getBenchmarkRuns(),
          apiService.getRedockingDefaults(),
          apiService.getRedockingRuns(),
        ]);
        setPresets(presetsRes || {});
        setTargets(targetsRes || []);
        setRuns(runsRes || []);
        setRedockingDefaults(redockingDefaultsRes || { pdb_ids: [], rmsd_threshold: 2.0 });
        setRedockingPdbIdsInput((redockingDefaultsRes?.pdb_ids || []).join(', '));
        setRedockingRuns(redockingRunsRes || []);
      } catch (error) {
        message.error('Failed to load benchmark configuration: ' + error.message);
      } finally {
        setLoadingMeta(false);
      }
    })();
  }, []);

  const fetchCurrentRun = useCallback(async (runId) => {
    try {
      const run = await apiService.getBenchmarkRun(runId);
      setCurrentRun(run);
      return run;
    } catch (error) {
      message.error('Failed to load run status: ' + error.message);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!currentRunId) return undefined;
    fetchCurrentRun(currentRunId);
    const interval = setInterval(async () => {
      const run = await fetchCurrentRun(currentRunId);
      if (run && !['pending', 'running'].includes(run.status)) {
        clearInterval(interval);
        const runsRes = await apiService.getBenchmarkRuns();
        setRuns(runsRes || []);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [currentRunId, fetchCurrentRun]);

  const fetchCurrentRedockingRun = useCallback(async (runId) => {
    try {
      const run = await apiService.getRedockingRun(runId);
      setCurrentRedockingRun(run);
      return run;
    } catch (error) {
      message.error('Failed to load redocking run status: ' + error.message);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!currentRedockingRunId) return undefined;
    fetchCurrentRedockingRun(currentRedockingRunId);
    const interval = setInterval(async () => {
      const run = await fetchCurrentRedockingRun(currentRedockingRunId);
      if (run && !['pending', 'running'].includes(run.status)) {
        clearInterval(interval);
        const runsRes = await apiService.getRedockingRuns();
        setRedockingRuns(runsRes || []);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [currentRedockingRunId, fetchCurrentRedockingRun]);

  const applyPreset = (key) => {
    const preset = presets[key];
    if (!preset) return;
    setSelectedTargets(preset.targets || []);
    setMaxActives(String(preset.max_actives_per_target ?? ''));
    setMaxDecoys(String(preset.max_decoys_per_target ?? ''));
    if (preset.rank_by) setRankBy(preset.rank_by);
    if (!runName) setRunName(preset.label);
  };

  const toggleTarget = (id) => {
    setSelectedTargets((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const filteredTargets = targets.filter((t) =>
    t.target_name.toLowerCase().includes(targetFilter.toLowerCase())
  );

  const handleRun = async () => {
    if (selectedTargets.length === 0) {
      message.error('Select at least one protein/target to benchmark against.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name: runName || `Benchmark - ${new Date().toLocaleString()}`,
        targets: selectedTargets,
        max_actives_per_target: maxActives ? Number(maxActives) : undefined,
        max_decoys_per_target: maxDecoys ? Number(maxDecoys) : undefined,
        rank_by: rankBy,
      };
      const created = await apiService.createBenchmarkRun(payload);
      message.success('Benchmark run started');
      setCurrentRunId(created.id);
    } catch (error) {
      message.error('Failed to start benchmark: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!currentRunId) return;
    try {
      await apiService.cancelBenchmarkRun(currentRunId);
      message.info('Cancel requested');
      fetchCurrentRun(currentRunId);
    } catch (error) {
      message.error('Failed to cancel run: ' + error.message);
    }
  };

  const handleResume = async (runId) => {
    try {
      await apiService.resumeBenchmarkRun(runId);
      message.success('Run resumed - continuing from the last completed target');
      setCurrentRunId(runId);
      fetchCurrentRun(runId);
      const runsRes = await apiService.getBenchmarkRuns();
      setRuns(runsRes || []);
    } catch (error) {
      message.error('Failed to resume run: ' + error.message);
    }
  };

  const handleRunFullSuite = async () => {
    const preset = presets.full_suite;
    if (!preset) return;
    const confirmed = window.confirm(
      `This will dock every target found under the dataset folder (${targets.length} in total), ` +
      `capped at ${preset.decoy_ratio}:1 decoys-per-active per target. Depending on the server this can ` +
      'take hours to days. It is resumable if interrupted. Start it now?'
    );
    if (!confirmed) return;

    setSubmitting(true);
    try {
      const created = await apiService.createBenchmarkRun({
        name: runName || `Full suite - ${new Date().toLocaleString()}`,
        preset: 'full_suite',
        rank_by: rankBy,
      });
      message.success('Full benchmark suite started');
      setCurrentRunId(created.id);
    } catch (error) {
      message.error('Failed to start full suite: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRunRedocking = async () => {
    const pdbIds = redockingPdbIdsInput
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (pdbIds.length === 0) {
      message.error('Enter at least one PDB id.');
      return;
    }
    setRedockingSubmitting(true);
    try {
      const created = await apiService.createRedockingRun({
        name: `Redocking - ${new Date().toLocaleString()}`,
        pdb_ids: pdbIds,
      });
      message.success('Redocking run started');
      setCurrentRedockingRunId(created.id);
    } catch (error) {
      message.error('Failed to start redocking run: ' + error.message);
    } finally {
      setRedockingSubmitting(false);
    }
  };

  const handleCancelRedocking = async () => {
    if (!currentRedockingRunId) return;
    try {
      await apiService.cancelRedockingRun(currentRedockingRunId);
      message.info('Cancel requested');
      fetchCurrentRedockingRun(currentRedockingRunId);
    } catch (error) {
      message.error('Failed to cancel run: ' + error.message);
    }
  };

  const handleResumeRedocking = async (runId) => {
    try {
      await apiService.resumeRedockingRun(runId);
      message.success('Run resumed - continuing from the last completed target');
      setCurrentRedockingRunId(runId);
      fetchCurrentRedockingRun(runId);
      const runsRes = await apiService.getRedockingRuns();
      setRedockingRuns(runsRes || []);
    } catch (error) {
      message.error('Failed to resume run: ' + error.message);
    }
  };

  const progressPercent = currentRun && currentRun.total_targets
    ? Math.round(((currentRun.completed_targets + currentRun.failed_targets) / currentRun.total_targets) * 100)
    : 0;
  const isActive = currentRun && ['pending', 'running'].includes(currentRun.status);

  const redockingProgressPercent = currentRedockingRun && currentRedockingRun.total_targets
    ? Math.round(((currentRedockingRun.completed_targets + currentRedockingRun.failed_targets) / currentRedockingRun.total_targets) * 100)
    : 0;
  const isRedockingActive = currentRedockingRun && ['pending', 'running'].includes(currentRedockingRun.status);

  const rankByOptions = [
    { value: 'affinity', label: 'Docking affinity' },
    { value: 'cnn_score', label: 'GNINA CNN score' },
    { value: 'both', label: 'Both' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Benchmark</h1>
      <p className="text-muted-foreground mb-6">
        Validate the docking pipeline against DUD-E / LIT-PCBA style targets: AUROC, EF1%/EF5%/EF10%
        and BEDROC, computed both from raw docking affinity and from GNINA's CNN-assisted score.
      </p>

      <Card title="Run a benchmark">
        {loadingMeta ? (
          <div className="text-muted-foreground text-sm">Loading...</div>
        ) : targets.length === 0 ? (
          <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-md px-3 py-3 text-sm text-destructive">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              No proteins/targets found on the server. This means the <code className="font-mono">BENCHMARK_DATA_DIR</code>{' '}
              setting doesn't point to a valid dataset folder (each target subfolder needs a <code className="font-mono">receptor.pdb</code>{' '}
              or <code className="font-mono">*_protein.mol2</code> plus matching actives/decoys files). Check the backend's
              environment configuration and restart it, then reload this page.
            </span>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Run name (optional)</label>
                <input
                  type="text"
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
                  placeholder="e.g. paper-figure-3-run"
                  value={runName}
                  onChange={(e) => setRunName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Rank compounds by</label>
                <div className="flex rounded-md border border-input overflow-hidden text-sm">
                  {rankByOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRankBy(opt.value)}
                      className={cn(
                        'flex-1 px-2 py-2 border-r border-input last:border-r-0',
                        rankBy === opt.value ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium">
                  Select protein(s)/target(s) to benchmark <span className="text-destructive">*</span>
                </label>
                <div className="flex items-center gap-2">
                  {Object.entries(presets).filter(([key]) => key !== 'full_suite').map(([key, p]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => applyPreset(key)}
                      className="text-xs px-2 py-1 rounded-md border border-border hover:bg-muted"
                      title={p.description}
                    >
                      Load: {p.label}
                    </button>
                  ))}
                  {selectedTargets.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedTargets([])}
                      className="text-xs px-2 py-1 rounded-md border border-border hover:bg-muted"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="relative mb-2">
                <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                <input
                  type="text"
                  className="w-full border border-input rounded-md pl-8 pr-3 py-2 text-sm bg-background"
                  placeholder="Filter by protein/target name..."
                  value={targetFilter}
                  onChange={(e) => setTargetFilter(e.target.value)}
                />
              </div>

              <div className="border border-border rounded-md h-56 overflow-y-auto divide-y divide-border">
                {filteredTargets.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">No targets match "{targetFilter}".</div>
                ) : (
                  filteredTargets.map((t) => {
                    const checked = selectedTargets.includes(t.id);
                    return (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => toggleTarget(t.id)}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted',
                          checked && 'bg-primary/5'
                        )}
                      >
                        {checked ? (
                          <CheckSquare className="w-4 h-4 text-primary shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-muted-foreground shrink-0" />
                        )}
                        <span className="font-medium">{t.target_name}</span>
                        <span className="text-xs text-muted-foreground">({t.source})</span>
                        <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                          {t.n_actives} actives / {t.n_decoys} decoys
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedTargets.length} protein{selectedTargets.length === 1 ? '' : 's'} selected. Each target's own
                receptor and reference ligand are used for docking - no separate protein upload needed.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Max actives per target</label>
                <input
                  type="number"
                  min={1}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
                  placeholder="100"
                  value={maxActives}
                  onChange={(e) => setMaxActives(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Max decoys per target</label>
                <input
                  type="number"
                  min={1}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
                  placeholder="1000"
                  value={maxDecoys}
                  onChange={(e) => setMaxDecoys(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-md px-3 py-2 text-sm">
              <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
              <span>This runs real docking jobs on the server (one per compound) - larger presets can take a while.</span>
            </div>

            <button
              type="button"
              onClick={handleRun}
              disabled={submitting || selectedTargets.length === 0}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
            >
              <Play className="w-4 h-4" />
              {submitting ? 'Starting...' : 'Run Benchmark'}
            </button>
          </div>
        )}
      </Card>

      {presets.full_suite && (
        <Card title={<span className="flex items-center gap-2"><Rocket className="w-4 h-4" />{presets.full_suite.label}</span>}>
          <p className="text-sm text-muted-foreground mb-3">{presets.full_suite.description}</p>
          <button
            type="button"
            onClick={handleRunFullSuite}
            disabled={submitting || targets.length === 0}
            className="inline-flex items-center gap-2 bg-destructive text-destructive-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
          >
            <Rocket className="w-4 h-4" />
            Run FULL Benchmark Suite ({targets.length} targets)
          </button>
        </Card>
      )}

      {currentRun && (
        <Card
          title={`Run: ${currentRun.name}`}
          extra={
            <div className="flex items-center gap-2">
              <StatusBadge status={currentRun.status} />
              {isActive && !isResumable(currentRun) && (
                <button
                  onClick={handleCancel}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-destructive text-destructive hover:bg-destructive/10"
                >
                  <StopCircle className="w-3.5 h-3.5" /> Cancel
                </button>
              )}
              {isResumable(currentRun) && (
                <button
                  onClick={() => handleResume(currentRun.id)}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-primary text-primary hover:bg-primary/10"
                  title={currentRun.status === 'running' ? 'No heartbeat in a while - the worker may have died' : undefined}
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Resume
                </button>
              )}
              <button
                onClick={() => fetchCurrentRun(currentRunId)}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border hover:bg-muted"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
              <button
                onClick={() => window.open(apiService.benchmarkExportCsvUrl(currentRunId), '_blank')}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border hover:bg-muted"
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
              <button
                onClick={() => window.open(apiService.benchmarkExportJsonUrl(currentRunId), '_blank')}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border hover:bg-muted"
              >
                <Download className="w-3.5 h-3.5" /> JSON
              </button>
            </div>
          }
        >
          <div className="w-full bg-muted rounded-full h-2 mb-4 overflow-hidden">
            <div
              className={cn('h-2 rounded-full transition-all', currentRun.status === 'failed' ? 'bg-destructive' : 'bg-primary')}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {currentRun.aggregate?.affinity && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
              <Stat label="Mean AUROC (affinity)" value={fmt(currentRun.aggregate.affinity.mean_auroc)} />
              <Stat label="Mean EF1% (affinity)" value={fmt(currentRun.aggregate.affinity.mean_ef1, 1)} />
              <Stat label="Mean BEDROC (affinity)" value={fmt(currentRun.aggregate.affinity.mean_bedroc)} />
              {currentRun.aggregate?.cnn_score && (
                <>
                  <Stat label="Mean AUROC (CNN)" value={fmt(currentRun.aggregate.cnn_score.mean_auroc)} />
                  <Stat label="Mean EF1% (CNN)" value={fmt(currentRun.aggregate.cnn_score.mean_ef1, 1)} />
                  <Stat label="Mean BEDROC (CNN)" value={fmt(currentRun.aggregate.cnn_score.mean_bedroc)} />
                </>
              )}
            </div>
          )}

          {currentRun.error_message && (
            <div className="bg-destructive/10 text-destructive text-sm rounded-md px-3 py-2 mb-4">
              {currentRun.error_message}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3">Target</th>
                  <th className="py-2 pr-3">Source</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Actives</th>
                  <th className="py-2 pr-3">Decoys</th>
                  <th className="py-2 pr-3">Failed</th>
                  <th className="py-2 pr-3">AUROC (aff.)</th>
                  <th className="py-2 pr-3">EF1% (aff.)</th>
                  <th className="py-2 pr-3">BEDROC (aff.)</th>
                  <th className="py-2 pr-3">AUROC (CNN)</th>
                  <th className="py-2 pr-3">EF1% (CNN)</th>
                  <th className="py-2 pr-3">BEDROC (CNN)</th>
                  <th className="py-2 pr-3">Avg time/ligand (s)</th>
                </tr>
              </thead>
              <tbody>
                {(currentRun.targets || []).map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 font-medium">{r.target_name}</td>
                    <td className="py-2 pr-3">{r.dataset_source}</td>
                    <td className="py-2 pr-3"><StatusBadge status={r.status} /></td>
                    <td className="py-2 pr-3">{r.n_actives}</td>
                    <td className="py-2 pr-3">{r.n_decoys}</td>
                    <td className="py-2 pr-3">{r.n_failed}</td>
                    <td className="py-2 pr-3">{fmt(r.metrics?.affinity?.auroc)}</td>
                    <td className="py-2 pr-3">{fmt(r.metrics?.affinity?.ef1, 1)}</td>
                    <td className="py-2 pr-3">{fmt(r.metrics?.affinity?.bedroc)}</td>
                    <td className="py-2 pr-3">{fmt(r.metrics?.cnn_score?.auroc)}</td>
                    <td className="py-2 pr-3">{fmt(r.metrics?.cnn_score?.ef1, 1)}</td>
                    <td className="py-2 pr-3">{fmt(r.metrics?.cnn_score?.bedroc)}</td>
                    <td className="py-2 pr-3">{fmt(r.avg_processing_time_sec, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title={<span className="flex items-center gap-2"><History className="w-4 h-4" />Run history</span>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Progress</th>
                <th className="py-2 pr-3">Created</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3 font-medium">{r.name}</td>
                  <td className="py-2 pr-3"><StatusBadge status={r.status} /></td>
                  <td className="py-2 pr-3">{r.completed_targets}/{r.total_targets}</td>
                  <td className="py-2 pr-3">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentRunId(r.id)}
                        className="text-xs px-2 py-1 rounded-md border border-border hover:bg-muted"
                      >
                        View
                      </button>
                      {isResumable(r) && (
                        <button
                          onClick={() => handleResume(r.id)}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-primary text-primary hover:bg-primary/10"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Resume
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {runs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-muted-foreground">No benchmark runs yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <h1 className="text-2xl font-bold mb-1 mt-10">Redocking (Pose Accuracy)</h1>
      <p className="text-muted-foreground mb-6">
        A different question from the enrichment benchmark above: can the pipeline reproduce the
        <em> correct pose</em>, not just rank a known binder above decoys? Each protein's own
        co-crystallized ligand is re-generated from scratch (a fresh 3D conformer from its SMILES,
        not the crystal coordinates - a real blind starting guess) and docked back in, then compared
        by RMSD to the original crystal pose. RMSD ≤ {redockingDefaults.rmsd_threshold}&nbsp;Å counts as a success,
        the standard threshold in the docking literature.
      </p>

      <Card title="Run a redocking validation">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">PDB IDs (comma or space separated)</label>
            <input
              type="text"
              className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background font-mono"
              placeholder="4HT2, 3EMG, 1KE9, 5OLH, 6O4W"
              value={redockingPdbIdsInput}
              onChange={(e) => setRedockingPdbIdsInput(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Fetched directly from RCSB - no upload needed. The co-crystallized ligand is
              auto-detected (the largest HETATM residue that isn't water/a buffer/an ion); if a PDB
              entry has more than one candidate, use the API's <code className="font-mono">ligand_resnames</code> override.
            </p>
          </div>

          <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-md px-3 py-2 text-sm">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
            <span>One real docking run per PDB id - a handful of targets finishes in minutes, not hours.</span>
          </div>

          <button
            type="button"
            onClick={handleRunRedocking}
            disabled={redockingSubmitting}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
          >
            <Play className="w-4 h-4" />
            {redockingSubmitting ? 'Starting...' : 'Run Redocking Validation'}
          </button>
        </div>
      </Card>

      {currentRedockingRun && (
        <Card
          title={`Run: ${currentRedockingRun.name}`}
          extra={
            <div className="flex items-center gap-2">
              <StatusBadge status={currentRedockingRun.status} />
              {isRedockingActive && !isResumable(currentRedockingRun) && (
                <button
                  onClick={handleCancelRedocking}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-destructive text-destructive hover:bg-destructive/10"
                >
                  <StopCircle className="w-3.5 h-3.5" /> Cancel
                </button>
              )}
              {isResumable(currentRedockingRun) && (
                <button
                  onClick={() => handleResumeRedocking(currentRedockingRun.id)}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-primary text-primary hover:bg-primary/10"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Resume
                </button>
              )}
              <button
                onClick={() => fetchCurrentRedockingRun(currentRedockingRunId)}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border hover:bg-muted"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
              <button
                onClick={() => window.open(apiService.redockingExportCsvUrl(currentRedockingRunId), '_blank')}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border hover:bg-muted"
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
              <button
                onClick={() => window.open(apiService.redockingExportJsonUrl(currentRedockingRunId), '_blank')}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border hover:bg-muted"
              >
                <Download className="w-3.5 h-3.5" /> JSON
              </button>
            </div>
          }
        >
          <div className="w-full bg-muted rounded-full h-2 mb-4 overflow-hidden">
            <div
              className={cn('h-2 rounded-full transition-all', currentRedockingRun.status === 'failed' ? 'bg-destructive' : 'bg-primary')}
              style={{ width: `${redockingProgressPercent}%` }}
            />
          </div>

          {currentRedockingRun.aggregate?.n_targets > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <Stat label="Mean RMSD - SR0 (Å)" value={fmt(currentRedockingRun.aggregate.mean_rmsd)} />
              <Stat
                label={`SR0: top pose ≤${redockingDefaults.rmsd_threshold} Å`}
                value={`${currentRedockingRun.aggregate.n_success}/${currentRedockingRun.aggregate.n_targets}`}
              />
              <Stat label="Mean RMSD - SR5 (Å)" value={fmt(currentRedockingRun.aggregate.mean_rmsd_sr5)} />
              <Stat
                label={`SR5: best of top-5 ≤${redockingDefaults.rmsd_threshold} Å`}
                value={`${currentRedockingRun.aggregate.n_success_sr5}/${currentRedockingRun.aggregate.n_targets}`}
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground mb-4">
            SR0/SR5 match the success-rate definitions used in SwissDock's own published validation
            (Grosdidier et al. 2011, <em>Nucleic Acids Research</em>) for a directly comparable number: SR0 = the
            single top-ranked docked pose is within the threshold; SR5 = the best of the 5 most-favorable
            ranked poses is within the threshold.
          </p>

          {currentRedockingRun.error_message && (
            <div className="bg-destructive/10 text-destructive text-sm rounded-md px-3 py-2 mb-4">
              {currentRedockingRun.error_message}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3">PDB ID</th>
                  <th className="py-2 pr-3">Ligand</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">RMSD SR0 (Å)</th>
                  <th className="py-2 pr-3">SR0</th>
                  <th className="py-2 pr-3">RMSD SR5 (Å)</th>
                  <th className="py-2 pr-3">SR5</th>
                  <th className="py-2 pr-3">Affinity</th>
                  <th className="py-2 pr-3">CNN affinity</th>
                  <th className="py-2 pr-3">Time (s)</th>
                </tr>
              </thead>
              <tbody>
                {(currentRedockingRun.targets || []).map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 font-medium">{t.pdb_id}</td>
                    <td className="py-2 pr-3">{t.ligand_resname || '—'}</td>
                    <td className="py-2 pr-3"><StatusBadge status={t.status} /></td>
                    <td className="py-2 pr-3">{fmt(t.rmsd, 2)}</td>
                    <td className="py-2 pr-3">
                      {t.success === null || t.success === undefined ? '—' : (t.success ? 'Yes' : 'No')}
                    </td>
                    <td className="py-2 pr-3">{fmt(t.rmsd_sr5, 2)}</td>
                    <td className="py-2 pr-3">
                      {t.success_sr5 === null || t.success_sr5 === undefined ? '—' : (t.success_sr5 ? 'Yes' : 'No')}
                    </td>
                    <td className="py-2 pr-3">{fmt(t.best_affinity, 2)}</td>
                    <td className="py-2 pr-3">{fmt(t.cnn_affinity, 2)}</td>
                    <td className="py-2 pr-3">{fmt(t.processing_time_sec, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title={<span className="flex items-center gap-2"><History className="w-4 h-4" />Redocking run history</span>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Progress</th>
                <th className="py-2 pr-3">Created</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {redockingRuns.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3 font-medium">{r.name}</td>
                  <td className="py-2 pr-3"><StatusBadge status={r.status} /></td>
                  <td className="py-2 pr-3">{r.completed_targets}/{r.total_targets}</td>
                  <td className="py-2 pr-3">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentRedockingRunId(r.id)}
                        className="text-xs px-2 py-1 rounded-md border border-border hover:bg-muted"
                      >
                        View
                      </button>
                      {isResumable(r) && (
                        <button
                          onClick={() => handleResumeRedocking(r.id)}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-primary text-primary hover:bg-primary/10"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Resume
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {redockingRuns.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-muted-foreground">No redocking runs yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

const Stat = ({ label, value }) => (
  <div className="bg-muted/50 rounded-md p-3">
    <div className="text-xs text-muted-foreground mb-1">{label}</div>
    <div className="text-lg font-semibold">{value}</div>
  </div>
);

export default Benchmark;
