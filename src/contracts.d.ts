/** Design contracts. Actual JS runtime uses the implemented subset documented in INTERFACES. */
export type Capability = 'supported' | 'unsupported' | 'unknown';
export interface SourceCapabilities {
  mode: 'live' | 'offline';
  sampleRateHz: number | null;
  channelCount: number | null;
  latencyMs: number | null;
  hardwareGainControl: Capability;
  stringFretIdentity: Capability;
  midi: Capability;
}
export interface PcmFrame {
  streamId: string;
  sequence: number;
  startSample: number;
  sampleRateHz: number;
  channels: Float32Array[];
  hopSize: number;
}
export interface PerformanceEvent { onsetMs: number; midi: number | null; confidence: number; }
export interface Preprocessor {
  algorithmicLatencySamples: number;
  lookaheadSamples: number;
  process(frame: PcmFrame): { frame: PcmFrame; uncertain: boolean };
  reset(): void;
}
/** Reserved: not yet emitted by current DSP, required before reliable 'missed' grading. */
export interface CaptureCoverage { startMs: number; endMs: number; reliable: boolean; }
