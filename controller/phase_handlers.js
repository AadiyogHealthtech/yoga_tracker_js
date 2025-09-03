console.log("Loading phase_handlers.js");
// Import utility functions for facing detection, DTW scoring, distance calculation, and drawing overlays
import {
  detectFacing,
  calculateDtwScore,
  calculateEuclideanDistance,
} from "../utils/utils.js";
import { printTextOnFrame, drawDtwScores } from "../utils/camera_utils.js";
import { denormalizeKeypoints } from "../utils/utils.js";
// Import a specific check for bend-back posture used in the starting phase
import {
  checkBendback,
  getScaledIdealKeypoint,
  getScalingFactor,
} from "./holding.js";
import { calculateAngle } from "../utils/utils.js";
/**
 * BasePhase
 * Abstract class that all specific phase handlers extend.
 * Provides common properties: reference to the controller, default hold duration,
 * and placeholders for normalized keypoints and hip tracking.
 */

import { validatePose } from "./errorDetection.js";
export class BasePhase {
  constructor(controller) {
    this.controller = controller;
    this.holdDuration = 0;
    this.normalizedKeypoints = null;
    this.hipPoint = 0;
  }
  /**
   * process
   * Each subclass must implement this method to handle its phase logic.
   * @param {number} currentTime - The timestamp (ms) for the current frame
   * @throws {Error} if not overridden
   */
  process(currentTime) {
    throw new Error("Not implemented");
  }
}

/**
 * StartPhase
 * Handles the initial "starting" segment where the user must assume the start pose
 * with the correct facing direction and hold it for the required duration.
 */
export class StartPhase extends BasePhase {
  /**
   * @param {Controller} controller - The main Controller instance
   * @param {string} targetFacing - The required orientation (e.g., 'front', 'side')
   */
  constructor(controller, targetFacing) {
    super(controller);
    console.log(`StartPhase initialized with target facing: ${targetFacing}`);
    this.targetFacing = targetFacing;
    this.start_time = null;
  }

  /**
   * process
   * Checks user’s facing direction, compares current keypoints to the expert start pose,
   * and enforces a hold duration. Draws feedback on the canvas.
   *
   * @param {number} currentTime - The timestamp (ms) for the current frame
   * @returns {[string, boolean]}
   *   • phase name (string)
   *   • completed flag (true once holdDuration is reached in correct pose)
   */
  process(currentTime) {
    this.controller.reset_phase = true;
    console.log("Processing StartPhase");
    // 1) Detect current facing, defaulting to 'random' if no landmarks
    const detectedFacing = this.controller.landmarks
      ? detectFacing(this.controller.landmarks)
      : "random";
    console.log(
      `StartPhase - Detected Facing: ${detectedFacing}, Target Facing: ${this.targetFacing}`
    );
    // 2) Identify the phase name from the current segment metadata
    const phase =
      this.controller.segments[this.controller.currentSegmentIdx].phase;
    // 3) Load expert keypoints for comparison (though expertKeypoints is unused here)
    const expertKeypoints = this.controller.getIdealKeypoints(
      this.targetFacing
    );
    // 4) Load the ideal starting keypoints for DTW comparison
    const idealStartingKeypoints = this.controller.getNextIdealKeypoints(
      "starting",
      0
    );
    // 5) Grab the thresholds configured for the starting segment
    this.thresholds = this.controller.segments[0].thresholds;
    console.log(`Thresholds of starting phase are ${this.thresholds}`);
    // 6) Use checkBendback to validate posture; returns updated context and a success flag
    const [ctx, success] = checkBendback(
      this.controller.frame,
      idealStartingKeypoints,
      this.controller.normalizedKeypoints,
      this.hipPoint,
      this.thresholds,
      this.controller.scalingFactor
    );
    if (this.controller.normalizedKeypoints != null) {
      const left_shoulder_angle = calculateAngle(
        this.controller.normalizedKeypoints[23],
        this.controller.normalizedKeypoints[11],
        this.controller.normalizedKeypoints[13]
      );
      printTextOnFrame(ctx, left_shoulder_angle);
    }
    this.controller.scalingFactor = getScalingFactor(
      ctx,
      12,
      idealStartingKeypoints,
      this.controller.normalizedKeypoints,
      this.controller.hipPoint
    );

    // Update the controller’s canvas context with any drawings from checkBendback
    this.controller.frame = ctx;
    console.log(`starting Frame Success: ${success}`);
    // 7) Calculate Euclidean distance between user and expert keypoints (not directly used)
    const distance = calculateEuclideanDistance(
      this.controller.normalizedKeypoints,
      expertKeypoints
    );
    // 8) If posture is correct AND facing matches target, show positive feedback and handle hold timing
    if (success && detectedFacing === this.targetFacing) {
      // if ((detectedFacing === this.targetFacing)) {
      printTextOnFrame(
        this.controller.frame,
        `Starting pose (${this.targetFacing}) detected`,
        { x: 10, y: 60 },
        "green"
      );
      // Record the time when correct pose was first seen
      if (this.start_time == null) {
        this.start_time = currentTime;
      } else {
        // If pose has been held long enough, mark phase as completed

        if (currentTime - this.start_time >= this.holdDuration) {
          console.log("Start phase completed");
          return [phase, true];
        }
      }
    } else {
      // 9) Otherwise, prompt user to face the correct direction

      printTextOnFrame(
        this.controller.frame,
        `Face ${this.targetFacing} to start`,
        { x: 10, y: 60 },
        "red"
      );
    }
    // 10) If hold duration not yet met, indicate phase is still in progress
    return [phase, false];
  }
}

// In phase_handlers.js - Modified TransitionPhase
/**
 * TransitionPhase
 * Handles the “transition” segment of an exercise, giving the user a countdown
 * and checking their movement against the next phase’s ideal pose.
 */
export class TransitionPhase extends BasePhase {
  constructor(controller, startFacing, transitionAnalyzer) {
    super(controller);
    this.transitionTimeout = 15; // milliseconds
    this.startFacing = startFacing;
    this.transitionAnalyzer = transitionAnalyzer;

    // state for the waypoint‐queue analyzer
    this._queueSegmentIdx = null;
    this._pointQueue = [];
    this._originalLength = 0;
  }
  reset_exercise() {
    this._queueSegmentIdx = null;
    this._pointQueue = [];
    this._originalLength = 0;
  }
  process(currentTime) {
    if (this.controller.reset_phase) {
      this.controller.reset_phase = false;
      this.reset_exercise();
    }
    const elapsedMs = currentTime - this.controller.startTime;
    const timeLeft = this.transitionTimeout - elapsedMs;
    const ctx = this.controller.frame;

    // -- timeout reset --
    if (timeLeft <= 0) {
      this.controller.currentSegmentIdx = 0;
      return [this.controller.segments[0].phase, false];
    }
    if (this.controller.normalizedKeypoints != null) {
      const left_shoulder_angle = calculateAngle(
        this.controller.normalizedKeypoints[23],
        this.controller.normalizedKeypoints[11],
        this.controller.normalizedKeypoints[13]
      );
      printTextOnFrame(ctx, left_shoulder_angle);
    }
    // draw countdown
    printTextOnFrame(
      ctx,
      `Transition: ${timeLeft.toFixed(1)}s remaining`,
      { x: 10, y: 60 },
      "yellow"
    );

    const currIdx = this.controller.currentSegmentIdx;
    const nextIdx = currIdx + 1;
    const nextSeg = this.controller.segments[nextIdx];
    const phase = nextSeg.phase;
    const thresholds = nextSeg.thresholds;

    // 1) posture check
    const idealKps = this.controller.getNextIdealKeypoints(phase, nextIdx);
    let [ctxAfterPosture, postureGood] = checkBendback(
      ctx,
      idealKps,
      this.controller.normalizedKeypoints,
      this.controller.hipPoint,
      thresholds,
      this.controller.scalingFactor,
      "Transition_phase"
    );

    // ✅ Run errorDetection.js validation here
    if (this.controller.normalizedKeypoints) {
      const poseValidation = validatePose(
        this.controller.normalizedKeypoints,
        "tadasana", // pose to check in transition
        this.controller.audioManager // pass AudioManager for chimes
      );
      if (poseValidation.status === "fail") {
        console.log("Pose validation failed:", poseValidation);
        printTextOnFrame(ctx, "Adjust pose...");
      }
    }

    // 2) path‐following queue logic
    let pathGood = true;
    const LEFT_WRIST = 16;
    const nk = this.controller.normalizedKeypoints;
    const hip = this.controller.hipPoint;

    if (nk) {
      // initialize queue once per segment
      if (this._queueSegmentIdx !== currIdx) {
        this._queueSegmentIdx = currIdx;
        this._pointQueue = [];

        const { start: s, end: e } = this.controller.segments[currIdx];
        const prevSeg = this.controller.segments[currIdx - 1] || {};
        const prevThresh = prevSeg.thresholds;
        const prevIdealAll = this.controller.getPrevIdealKeypoints(currIdx - 1);

        if (prevThresh) {
          for (let i = s; i < e; i++) {
            const ideal = this.controller.yoga.getIdealKeypoints(i, i + 1)[0];
            // const denorm= denormalizeKeypoints(ideal, hip);
            const denorm = ideal;

            // if the previous‐segment posture fails, queue this frame
            const [, ok] = checkBendback(
              ctxAfterPosture,
              prevIdealAll,
              ideal,
              hip,
              prevThresh,
              this.controller.scalingFactor
            );
            if (!ok) this._pointQueue.push(denorm);
          }
          this._originalLength = this._pointQueue.length;
        }
      }

      // if there are waypoints, draw + check next one
      if (this._pointQueue.length > 0) {
        // draw all remaining targets
        for (const frame of this._pointQueue) {
          //   const pt = frame[LEFT_WRIST] || frame;
          console.log("CURRENT FRAME IS :", frame);
          const { pix: pt } = getScaledIdealKeypoint(
            ctx,
            LEFT_WRIST,
            frame,
            this.controller.normalizedKeypoints,
            this.controller.hipPoint,
            this.controller.scalingFactor
          );
          if (!pt) continue;
          //   const [ tx, ty ] = this._toPixelCoords(pt, ctx.canvas.width, ctx.canvas.height);
          console.log("PT IS : ", pt);
          const [tx, ty] = pt;
          ctx.beginPath();
          ctx.arc(tx, ty, 8, 0, Math.PI * 2);
          ctx.strokeStyle = "cyan";
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // check user wrist vs next target
        const targetRaw = this._pointQueue[0][LEFT_WRIST];
        const target = [
          targetRaw[0] + this.controller.hipPoint[0],
          targetRaw[1] + this.controller.hipPoint[1],
        ];
        console.log("Target is:", target);

        const [tx, ty] = this._toPixelCoords(
          target,
          ctx.canvas.width,
          ctx.canvas.height
        );

        const userRaw = nk[LEFT_WRIST];
        const userRel = [
          userRaw[0] + this.controller.hipPoint[0],
          userRaw[1] + this.controller.hipPoint[1],
        ];
        console.log("userRel is:", userRel);
        const [ux, uy] = this._toPixelCoords(
          userRel,
          ctx.canvas.width,
          ctx.canvas.height
        );

        if (Math.hypot(tx - ux, ty - uy) <= 40) {
          this._pointQueue.shift();
        }

        const done = this._originalLength - this._pointQueue.length;
        const ratio = done / this._originalLength;
        pathGood = ratio >= 0.85;

        if (pathGood) {
          // clear for next segment
          this._pointQueue = [];
          this._queueSegmentIdx = null;
        }
      }
    }

    // finalize and return
    this.controller.frame = ctxAfterPosture;
    if (postureGood && !pathGood) {
      console.log("transition path was not successfull");
      printTextOnFrame(ctx, "TRANSITION TOO FAST");
      return [phase, true];
    }

    const success = postureGood && pathGood;

    // extra safety reset
    if (elapsedMs >= this.transitionTimeout) {
      this.controller.currentSegmentIdx = 0;
    }

    return [phase, success];
  }

  _toPixelCoords(point, width, height) {
    const x = point.x != null ? point.x : point[0] != null ? point[0] : 0;
    const y = point.y != null ? point.y : point[1] != null ? point[1] : 0;
    return [x * width, y * height];
  }
}

/**
 * HoldingPhase
 * Manages the “holding” segment where the user must maintain a specific pose.
 * Provides feedback via DTW scores and guidance arrows, and enforces hold duration.
 */

export class HoldingPhase extends BasePhase {
  /**
   * @param {Controller} controller - Main Controller instance
   * @param {number[]} thresholds - Array of threshold values for DTW and posture checks
   * @param {string} startFacing - Expected facing direction (unused here)
   */
  constructor(controller, thresholds, startFacing) {
    // Reset all timers and state for a fresh hold
    super(controller);
    this._resetTimers();
    this.startFacing = startFacing;
    console.log("HoldingPhase initialized with thresholds:", thresholds);
    this.thresholds = thresholds;
    console.log(`Thresholds are: ${thresholds}`);
    // Track when the user first achieved a successful hold
    this.holdStartTime = null;
    this.successDuration = 0;
    this.minHoldDuration = 0;
    this.completedHold = false;
    this.exitThresholdMultiplier = 0.8;
    this.leavePoseTime = null;
    this.doneonce = false;
  }
  /**
   * Reset timers and state between holds.
   * Called when a hold completes to allow re-entry logic.
   */
  _resetTimers() {
    this.holdStartTime = null;
    this.successDuration = 0;
    this.completedHold = false;
    this.leavePoseTime = null;
    this.doneonce = false;
  }

  /**
   * process
   * Called each frame during a holding segment. Checks posture, computes DTW
   * distance, draws guidance, and determines when the hold is completed or abandoned.
   *
   * @param {number} currentTime - Current timestamp (ms)
   * @returns {[string, boolean]}
   *   • current phase name
   *   • completed flag indicating whether the hold phase is done
   */

  process(currentTime) {
    console.log("controller" + this.controller.normalizedKeypoints);
    console.log("Processing HoldingPhase");
    // 1) Determine phase name and ideal keypoints
    const phase =
      this.controller.segments[this.controller.currentSegmentIdx].phase;
    const idealKeypoints = this.controller.getIdealKeypoints(phase);
    console.log(
      "Ideal keypoints for holding phase from phase handler:",
      idealKeypoints
    );
    console.log(
      `Normalised keypoints in Holding ${this.controller.normalizedKeypoints}`
    );

    // 2) If there was a previous transition, compute and display DTW on it
    if (
      this.controller.lastHoldingIdx !== -1 &&
      this.controller.currentSegmentIdx > this.controller.lastHoldingIdx &&
      this.controller.transitionKeypoints.length
    ) {
      // Gather ideal vs. actual transition keypoints
      const idealTransKeypoints = this.controller.getTransitionKeypoints(
        this.controller.lastHoldingIdx,
        this.controller.currentSegmentIdx
      );
      if (
        idealTransKeypoints.length &&
        this.controller.transitionKeypoints.length
      ) {
        // Compare up to the shorter length
        const minLen = Math.min(
          this.controller.transitionKeypoints.length,
          idealTransKeypoints.length
        );
        const userTrans = this.controller.transitionKeypoints
          .slice(0, minLen)
          .flat();
        const idealTrans = idealTransKeypoints.slice(0, minLen).flat();
        const { dtwDistance } = calculateDtwScore(userTrans, idealTrans);
        const color = dtwDistance < 50 ? "green" : "red";

        // Overlay the transition DTW score
        printTextOnFrame(
          this.controller.frame,
          `Transition DTW: ${dtwDistance.toFixed(2)}`,
          { x: 10, y: 120 },
          color
        );
      }
    }

    // 3) If normalized keypoints are available, run posture check
    if (this.controller.normalizedKeypoints) {
      // checkBendback returns updated context and success boolean
      const [ctx, success] = checkBendback(
        this.controller.frame,
        idealKeypoints,
        this.controller.normalizedKeypoints,
        this.controller.hipPoint,
        this.thresholds,
        this.controller.scalingFactor
      );
      console.log(`Success in holding frame ${success}`);
      this.controller.frame = ctx;
      if (this.controller.normalizedKeypoints != null) {
        const left_shoulder_angle = calculateAngle(
          this.controller.normalizedKeypoints[23],
          this.controller.normalizedKeypoints[11],
          this.controller.normalizedKeypoints[13]
        );
        printTextOnFrame(ctx, left_shoulder_angle);
      }
      // Compute overall DTW on the whole pose for guidance
      const { dtwDistance: dtwWhole } = calculateDtwScore(
        idealKeypoints,
        this.controller.normalizedKeypoints
      );
      const { dtwHands: dtwHands } = calculateDtwScore(
        idealKeypoints,
        this.controller.normalizedKeypoints
      );

      const exitThreshold = this.thresholds[0] * this.exitThresholdMultiplier;
      // 4) Handle early abandonment: if user breaks pose before completion
      if (!success && !this.completedHold) {
        // user is out of pose before completing
        if (this.leavePoseTime === null) {
          this.leavePoseTime = currentTime;
        }
        const elapsedLeave = currentTime - this.leavePoseTime;
        if (elapsedLeave > this.controller.phaseTimeouts.holdingAbandonment) {
          // 10 s up → force relaxation
          this.controller.enterRelaxation();
          return ["holding", false];
        }
      } else {
        // either success or already completedHold
        this.leavePoseTime = null;
      }
      // Draw DTW scores
      const scores = {
        [phase]: { value: dtwWhole, threshold: this.thresholds[0] },
      };
      drawDtwScores(this.controller.frame, scores);

      // Draw arrow from user wrist to ideal wrist position
      const width = this.controller.frame.canvas.width;
      const height = this.controller.frame.canvas.height;
      const userWrist = this.controller.landmarks[15];
      const idealWrist = idealKeypoints[15];
      const userWristPixel = [
        ((userWrist[0] + 1) * width) / 2,
        ((userWrist[1] + 1) * height) / 2,
      ];
      const idealWristPixel = [
        ((idealWrist[0] + 1) * width) / 2,
        ((idealWrist[1] + 1) * height) / 2,
      ];
      this.controller.frame.beginPath();
      this.controller.frame.moveTo(userWristPixel[0], userWristPixel[1]);
      this.controller.frame.lineTo(idealWristPixel[0], idealWristPixel[1]);
      this.controller.frame.strokeStyle = success ? "green" : "red";
      this.controller.frame.lineWidth = 3;
      this.controller.frame.stroke();
      // Draw arrowhead
      const angle = Math.atan2(
        idealWristPixel[1] - userWristPixel[1],
        idealWristPixel[0] - userWristPixel[0]
      );
      const arrowSize = 10;
      this.controller.frame.beginPath();
      this.controller.frame.moveTo(idealWristPixel[0], idealWristPixel[1]);
      this.controller.frame.lineTo(
        idealWristPixel[0] - arrowSize * Math.cos(angle + Math.PI / 6),
        idealWristPixel[1] - arrowSize * Math.sin(angle + Math.PI / 6)
      );
      this.controller.frame.moveTo(idealWristPixel[0], idealWristPixel[1]);
      this.controller.frame.lineTo(
        idealWristPixel[0] - arrowSize * Math.cos(angle - Math.PI / 6),
        idealWristPixel[1] - arrowSize * Math.sin(angle - Math.PI / 6)
      );
      this.controller.frame.stroke();
      console.log(
        `Arrow drawn from (${userWristPixel[0]}, ${userWristPixel[1]}) to (${idealWristPixel[0]}, ${idealWristPixel[1]})`
      );

      if (success) {
        if (!this.holdStartTime) this.holdStartTime = currentTime;
        this.successDuration = currentTime - this.holdStartTime;
        printTextOnFrame(
          this.controller.frame,
          `Holding ${phase} (${this.successDuration.toFixed(1)}s)`,
          { x: 10, y: 60 },
          "green"
        );
        if ((this.doneonce = false)) {
          for (let i = 0; i < this.thresholds.length; i++) {
            this.thresholds[i] *= this.exitThresholdMultiplier;
          }
          this.doneonce = true;
        }

        if (
          this.successDuration >= this.minHoldDuration &&
          !this.completedHold
        ) {
          this.completedHold = true;
          printTextOnFrame(
            this.controller.frame,
            "Hold completed, stay or adjust to exit",
            { x: 10, y: 90 },
            "green"
          );
        }
      } else {
        if (this.completedHold && !success) {
          const phaseName = phase.split("_")[1] || phase;
          printTextOnFrame(
            this.controller.frame,
            `${phaseName} completed, exiting hold (DTW: ${dtwWhole.toFixed(
              2
            )})`,
            { x: 10, y: 60 },
            "green"
          );
          console.log("Holding phase completed");

          this._resetTimers();
          return [phase, true];
        }
        if (!this.completedHold) {
          this.holdStartTime = null;
          this.successDuration = 0;
          printTextOnFrame(
            this.controller.frame,
            "Adjust pose to hold",
            { x: 10, y: 60 },
            "red"
          );
        } else {
          printTextOnFrame(
            this.controller.frame,
            `Hold completed, stay or adjust to exit (DTW: ${dtwWhole.toFixed(
              2
            )})`,
            { x: 10, y: 60 },
            "green"
          );
        }
      }
    } else {
      printTextOnFrame(
        this.controller.frame,
        "Adjust pose",
        { x: 10, y: 60 },
        "red"
      );
      this.holdStartTime = null;
      this.successDuration = 0;
      this.completedHold = false;
    }
    return [
      this.controller.segments[this.controller.currentSegmentIdx].phase,
      false,
    ];
  }
}
/**
 * EndingPhase
 * Manages the “ending” segment where the user must return to the end pose
 * and hold it, similar to StartPhase but signifying rep completion.
 */
export class EndingPhase extends BasePhase {
  /**
   * @param {Controller} controller - Main Controller instance
   * @param {string} targetFacing - Required orientation to finish the rep
   */
  constructor(controller, targetFacing) {
    super(controller);
    console.log(`EndingPhase initialized with target facing: ${targetFacing}`);
    this.targetFacing = targetFacing;
    this.thresholds = null;
  }
  /**
   * process
   * Checks that the user has assumed the end pose with correct facing,
   * holds it for the required duration, and signals phase completion.
   *
   * @param {number} currentTime - Current timestamp (ms)
   * @returns {[string, boolean]}
   *   • phase name
   *   • completed flag indicating whether end hold duration is met
   */
  process(currentTime) {
    console.log("Processing EndingPhase");
    // 1) Detect current facing or default to 'random'
    const detectedFacing = this.controller.landmarks
      ? detectFacing(this.controller.landmarks)
      : "random";
    console.log(
      `EndingPhase - Detected Facing: ${detectedFacing}, Target Facing: ${this.targetFacing}`
    );
    // 2) Identify phase name and load ideal keypoints & thresholds
    const phase =
      this.controller.segments[this.controller.currentSegmentIdx].phase;
    const idealEndingKeypoints = this.controller.getNextIdealKeypoints(
      "starting",
      0
    );
    this.thresholds = this.controller.segments[0].thresholds;
    console.log(`Thresholds of ending phase are ${this.thresholds}`);
    // 3) Run bend-back/posture check on the end pose
    const [ctx, success] = checkBendback(
      this.controller.frame,
      idealEndingKeypoints,
      this.controller.normalizedKeypoints,
      this.controller.hipPoint,
      this.thresholds,
      this.controller.scalingFactor
    );
    this.controller.frame = ctx;
    console.log(`Ending Frame Success: ${success}`);

    if (this.controller.normalizedKeypoints != null) {
      const left_shoulder_angle = calculateAngle(
        this.controller.normalizedKeypoints[23],
        this.controller.normalizedKeypoints[11],
        this.controller.normalizedKeypoints[13]
      );
      printTextOnFrame(ctx, left_shoulder_angle);
    }
    // 4) If posture and facing are correct, prompt and hold
    if (success && detectedFacing === this.targetFacing) {
      // if ((detectedFacing === this.targetFacing)) {
      printTextOnFrame(
        this.controller.frame,
        "Repetition completed",
        { x: 10, y: 60 },
        "green"
      );
      if (currentTime - this.controller.startTime >= this.holdDuration) {
        this.controller.count++;
        console.log("Ending phase completed");
        return [phase, true];
      }
    } else {
      printTextOnFrame(
        this.controller.frame,
        `Face ${this.targetFacing} to end or Go to ending position to end`,
        { x: 10, y: 60 },
        "red"
      );
    }
    return [phase, false];
  }
}

/**
 * RelaxationPhase
 * Handles the rest period between reps or exercises, displaying a calming prompt
 * and detecting when the user is ready to resume.
 */
export class RelaxationPhase extends BasePhase {
  /**
   * @param {Controller} controller - Main Controller instance
   */
  constructor(controller) {
    super(controller);
    this.currentFeedback = "Relax and breathe";
  }
  /**
   * process
   * Clears any transition data, draws the relaxation prompt,
   * and returns completion status based on pose + facing check.
   *
   * @param {number} currentTime - Current timestamp (ms) — unused here
   * @returns {{ phase: string, completed: boolean }}
   *   • phase: 'relaxation'
   *   • completed: whether the user is ready to resume
   */
  process(currentTime) {
    // clear any transition data
    // 1) Clear stored transition traces and last holding index
    this.controller.transitionKeypoints = [];
    this.controller.lastHoldingIdx = -1;

    // draw feedback
    printTextOnFrame(
      this.controller.frame,
      this.currentFeedback,
      { x: 10, y: 60 },
      "rgb(255, 165, 0)"
    );

    // only the shouldExitRelaxation() result matters here
    return {
      phase: "relaxation",
      completed: this.shouldExitRelaxation(),
    };
  }
  /**
   * shouldExitRelaxation
   * Determines if the user is back in the starting pose and facing correctly,
   * indicating readiness to begin the next rep.
   *
   * @returns {boolean} True if distance and facing thresholds are met
   */
  shouldExitRelaxation() {
    const startSegment = this.controller.segments.find(
      (s) => s.type === "starting"
    );
    if (!startSegment) return false;

    // get expert pose (you may need to pick the right frame index)
    const expertKeypoints = this.controller.getIdealKeypoints(
      startSegment.phase
    );
    const userKeypoints = this.controller.normalizedKeypoints;
    const distance = calculateEuclideanDistance(userKeypoints, expertKeypoints);

    // check facing + distance threshold
    const THRESHOLD = 0.15;
    const userFacing = this.controller.landmarks
      ? detectFacing(this.controller.landmarks)
      : null;

    return distance < THRESHOLD && userFacing === startSegment.facing;
  }
}
