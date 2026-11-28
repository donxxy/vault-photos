import fsp from "fs/promises";
import os from "os";

type CpuSample = { usageNs: bigint; at: bigint; source: string; cores: number };
let previousCpu: CpuSample | null = null;

function isUnavailable(error: unknown): boolean {
  return error instanceof Error && "code" in error &&
    ["ENOENT", "EACCES", "EPERM"].includes(String(error.code));
}

async function readOptional(file: string) {
  try {
    return await fsp.readFile(file, "utf8");
  } catch (error) {
    if (isUnavailable(error)) return null;
    throw error;
  }
}

async function cpuLimit() {
  const v2 = await readOptional("/sys/fs/cgroup/cpu.max");
  if (v2) {
    const [quota, period] = v2.trim().split(/\s+/);
    if (quota && quota !== "max" && period) {
      const cores = Number(quota) / Number(period);
      if (Number.isFinite(cores) && cores > 0) return cores;
    }
  }
  const [quotaText, periodText] = await Promise.all([
    readOptional("/sys/fs/cgroup/cpu/cpu.cfs_quota_us"),
    readOptional("/sys/fs/cgroup/cpu/cpu.cfs_period_us"),
  ]);
  if (quotaText && periodText) {
    const cores = Number(quotaText) / Number(periodText);
    if (Number.isFinite(cores) && cores > 0) return cores;
  }
  return os.availableParallelism();
}

async function cpuUsage() {
  const v2 = await readOptional("/sys/fs/cgroup/cpu.stat");
  const usec = v2?.match(/^usage_usec\s+(\d+)$/m)?.[1];
  if (usec) return { usageNs: BigInt(usec) * 1000n, source: "container" };

  const v1 = await readOptional("/sys/fs/cgroup/cpuacct/cpuacct.usage");
  if (v1 && /^\d+$/.test(v1.trim())) return { usageNs: BigInt(v1.trim()), source: "container" };

  const cpu = process.cpuUsage();
  return { usageNs: BigInt(cpu.user + cpu.system) * 1000n, source: "app process" };
}

async function memoryUsage() {
  const [v2Used, v2Limit] = await Promise.all([
    readOptional("/sys/fs/cgroup/memory.current"),
    readOptional("/sys/fs/cgroup/memory.max"),
  ]);
  if (v2Used && v2Limit && v2Limit.trim() !== "max") {
    const used = Number(v2Used), limit = Number(v2Limit);
    if (Number.isFinite(used) && Number.isFinite(limit) && limit > 0) {
      return { usedBytes: used, limitBytes: limit, percent: Math.min(100, used / limit * 100), source: "container" };
    }
  }

  const [v1Used, v1Limit] = await Promise.all([
    readOptional("/sys/fs/cgroup/memory/memory.usage_in_bytes"),
    readOptional("/sys/fs/cgroup/memory/memory.limit_in_bytes"),
  ]);
  if (v1Used && v1Limit) {
    const used = Number(v1Used), limit = Number(v1Limit);
    if (Number.isFinite(used) && Number.isFinite(limit) && limit > 0 && limit < 2 ** 60) {
      return { usedBytes: used, limitBytes: limit, percent: Math.min(100, used / limit * 100), source: "container" };
    }
  }

  return { usedBytes: process.memoryUsage().rss, limitBytes: null, percent: null, source: "app process" };
}

export async function getContainerMetrics() {
  const [cpu, cores, memory] = await Promise.all([cpuUsage(), cpuLimit(), memoryUsage()]);
  const now = process.hrtime.bigint();
  const cpuPercent = previousCpu && previousCpu.source === cpu.source
    ? Math.max(0, Math.min(100, Number(cpu.usageNs - previousCpu.usageNs) / Number(now - previousCpu.at) / cores * 100))
    : null;
  previousCpu = { ...cpu, at: now, cores };

  const mdstat = await readOptional("/proc/mdstat");
  const raid = mdstat
    ? (/^md\d+\s*:/m.test(mdstat) ? mdstat.trim() : "No Linux software RAID arrays are reported by /proc/mdstat.")
    : null;

  return { cpuPercent, cpuCores: cores, cpuSource: cpu.source, memory, raid };
}
