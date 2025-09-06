import { calculateAngle, normalizeKeypoints, detectFacing } from "../utils/utils.js";
const _lastPlayed = {};
const DEFAULT_COOLDOWN_MS = 1500;
let poseRules = null; // cached rules

/**
 * Preload poseRules.json once.
 * Call this ONCE during app startup (before validatePose is used).
 */
export async function initErrorDetection() {
  if (!poseRules) {
    try {
      const res = await fetch("../utils/poseRules.json");
      poseRules = await res.json();
      console.log("poseRules loaded:", Object.keys(poseRules));
    } catch (err) {
      console.error("Failed to load poseRules.json:", err);
      poseRules = {};
    }
  }
}

/**
 * Try to play audio (throttled per errorId).
 */
function _tryPlayAudio(audioManager, errorId, cooldownMs = DEFAULT_COOLDOWN_MS) {
  if (!audioManager || !errorId) return;
  const now = Date.now();
  const last = _lastPlayed[errorId] || 0;
  if (now - last >= cooldownMs) {
    try {
      audioManager.play(errorId);
      _lastPlayed[errorId] = now;
    } catch (err) {
      console.warn("errorDetection: audioManager.play failed for", errorId, err);
    }
  }
}

/**
 * Reset cooldown state.
 */
export function resetErrorDetectionState() {
  for (const k of Object.keys(_lastPlayed)) delete _lastPlayed[k];
}

/**
 * Parse "X ± Y" into [min,max].
 */
function _parseTarget(targetStr) {
  if (!targetStr || !targetStr.includes("±")) return null;
  try {
    const [base, tol] = targetStr.split("±").map(s => parseFloat(s.trim()));
    if (isNaN(base) || isNaN(tol)) return null;
    return [base - tol, base + tol];
  } catch {
    return null;
  }
}

/**
 * Get normalized point safely.
 */
function _getPoint(normalized, idx) {
  if (!Array.isArray(normalized)) return null;
  if (idx < 0 || idx >= normalized.length) return null;
  return normalized[idx] || null;
}

/**
 * Validate pose (SYNC – no await needed).
 */
export function validatePose(landmarks, poseName, audioManager) {
  if (!poseRules) {
    console.warn("⚠️ poseRules not loaded. Did you call initErrorDetection()?");
    return { status: "fail", reason: "poseRules not loaded" };
  }

  const [normalized] = normalizeKeypoints(landmarks);
  if (!normalized) {
    console.warn("No keypoints detected");
    return { status: "fail", reason: "No keypoints detected" };
  }

  const rules = poseRules[poseName];
  if (!rules) {
    console.error(`No rules defined for pose "${poseName}"`);
    return { status: "fail", reason: `No rules defined for pose "${poseName}"` };
  }

  // Facing check
  if (rules.requiresFrontFacing) {
    const facing = detectFacing(landmarks);
    if (facing !== "front") {
      _tryPlayAudio(audioManager, "facing_error");
      return {
        status: "fail",
        reason: `Pose requires front facing but detected: ${facing}`,
        failedRules: ["facing"],
      };
    }
  }

  const failed = [];

  for (const rule of rules.angles) {
    const range = _parseTarget(rule.target);
    if (!range) {
      console.warn("Invalid target format for rule:", rule.name, rule.target);
      continue;
    }
    const [min, max] = range;

    // Must be 3 or 6 keypoints
    if (!Array.isArray(rule.keypoints) ||
        (rule.keypoints.length !== 3 && rule.keypoints.length !== 6)) {
      console.warn("Skipping invalid keypoints rule:", rule.name, rule.keypoints);
      continue;
    }

    let angles = [];

    // Single-angle
    if (rule.keypoints.length === 3) {
      const [aIdx, bIdx, cIdx] = rule.keypoints;
      const a = _getPoint(normalized, aIdx);
      const b = _getPoint(normalized, bIdx);
      const c = _getPoint(normalized, cIdx);
      if (!a || !b || !c) {
        console.warn("Missing keypoints in rule:", rule.name);
        _tryPlayAudio(audioManager, rule.errorId);
        failed.push({
          rule: rule.name,
          angle: null,
          expected: [min, max],
          reason: "missing_keypoint",
          errorId: rule.errorId,
        });
        continue;
      }
      try {
        angles.push(calculateAngle(a, b, c));
      } catch (err) {
        console.error("calculateAngle failed:", rule.name, err);
        continue;
      }
    }

    // Paired-angle
    if (rule.keypoints.length === 6) {
      const [a1, b1, c1, a2, b2, c2] = rule.keypoints;
      const set1 = [_getPoint(normalized, a1), _getPoint(normalized, b1), _getPoint(normalized, c1)];
      const set2 = [_getPoint(normalized, a2), _getPoint(normalized, b2), _getPoint(normalized, c2)];

      if (set1.some(pt => !pt) || set2.some(pt => !pt)) {
        console.warn("Missing keypoints in paired rule:", rule.name);
        _tryPlayAudio(audioManager, rule.errorId);
        failed.push({
          rule: rule.name,
          angle: null,
          expected: [min, max],
          reason: "missing_keypoint",
          errorId: rule.errorId,
        });
        continue;
      }

      try {
        angles.push(calculateAngle(...set1), calculateAngle(...set2));
      } catch (err) {
        console.error("calculateAngle failed in paired rule:", rule.name, err);
        continue;
      }
    }

    // Range check
    const outOfRange = angles.some(angle => angle < min || angle > max);
    if (outOfRange) {
      _tryPlayAudio(audioManager, rule.errorId);
      failed.push({
        rule: rule.name,
        angles,
        expected: [min, max],
        errorId: rule.errorId,
      });
    }
  }

  return failed.length === 0
    ? { status: "pass" }
    : { status: "fail", failedRules: failed };
}
