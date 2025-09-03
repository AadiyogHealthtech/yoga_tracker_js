import { calculateAngle, normalizeKeypoints, detectFacing } from "../utils/utils.js";
import poseRules from "../utils/poseRules.json" assert { type: "json" };

/**
 * Non-blocking error detection + audio feedback.
 * validatePose is synchronous so it can be called from frame loop without `await`.
 *
 * Audio plays are throttled per errorId to avoid spamming the user every frame.
 */

const _lastPlayed = {}; // { errorId: timestampMs }
const DEFAULT_COOLDOWN_MS = 1500;

/**
 * Try to play audio for an errorId (throttled).
 * @param {AudioManager} audioManager
 * @param {string} errorId
 * @param {number} cooldownMs
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
      // don't throw — just log
      console.warn("errorDetection: audioManager.play failed for", errorId, err);
    }
  }
}

/**
 * Reset internal state (audio cooldowns).
 */
export function resetErrorDetectionState() {
  for (const k of Object.keys(_lastPlayed)) delete _lastPlayed[k];
}

/**
 * Validate pose synchronously.
 * @param {Array} landmarks - raw keypoints (as passed to normalizeKeypoints)
 * @param {string} poseName - key in poseRules
 * @param {AudioManager} audioManager - optional, used to play correction audio
 * @returns {{status: string, reason?: string, failedRules?: Array}}
 */
export function validatePose(landmarks, poseName, audioManager) {
  console.log("validatePose called with pose:", poseName);
  console.log("Landmarks input:", landmarks);

  const [normalized] = normalizeKeypoints(landmarks);
  console.log("Normalized keypoints:", normalized);

  if (!normalized) {
    console.warn("No keypoints detected");
    return { status: "fail", reason: "No keypoints detected" };
  }

  const rules = poseRules[poseName];
  console.log("Loaded rules for", poseName, ":", rules);

  if (!rules) {
    console.error(`No rules defined for pose "${poseName}"`);
    return { status: "fail", reason: `No rules defined for pose "${poseName}"` };
  }

  // facing check
  if (rules.requiresFrontFacing) {
    const facing = detectFacing(landmarks);
    console.log("Detected facing:", facing);

    if (facing !== "front") {
      console.warn(`Pose requires front facing but detected: ${facing}`);
      _tryPlayAudio(audioManager, "facing_error");
      return {
        status: "fail",
        reason: `Pose requires front facing but detected: ${facing}`,
        failedRules: ["facing"],
      };
    }
  }

  // angle checks (synchronous)
  const failed = [];
  for (const rule of rules.angles) {
    console.log("Checking rule:", rule.name);

    const [aIdx, bIdx, cIdx] = rule.keypoints;
    const a = normalized[aIdx];
    const b = normalized[bIdx];
    const c = normalized[cIdx];
    console.log("Keypoints for", rule.name, ":", { a, b, c });

    // If any keypoint missing, treat as failure for that rule
    if (!a || !b || !c) {
      console.warn("Missing keypoints in rule:", rule.name);
      const id = rule.errorId || rule.name;
      _tryPlayAudio(audioManager, id);
      failed.push({
        rule: rule.name,
        angle: null,
        expected: [rule.min, rule.max],
        reason: "missing_keypoint",
      });
      continue;
    }

    const angle = calculateAngle(a, b, c);
    console.log(
      `Angle for ${rule.name}:`,
      angle,
      "(expected between",
      rule.min,
      "and",
      rule.max,
      ")"
    );

    if (angle < rule.min || angle > rule.max) {
      console.warn(`Angle check failed for rule ${rule.name}`);
      const id = rule.errorId || rule.name;
      _tryPlayAudio(audioManager, id);
      failed.push({
        rule: rule.name,
        angle,
        expected: [rule.min, rule.max],
      });
    }
  }

  if (failed.length === 0) {
    console.log("Pose passed all checks!");
    return { status: "pass" };
  } else {
    console.warn("Pose failed with rules:", failed);
    return { status: "fail", failedRules: failed };
  }
}
