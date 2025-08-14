<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { FilesetResolver, PoseLandmarker, DrawingUtils } from '@mediapipe/tasks-vision';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { poseLandmarkerStore } from '$lib/store/poseLandmarkerStore';
  import target from '$lib/Images/target.svg';
  import award from '$lib/Images/award.svg';
  import pause from '$lib/Images/pause-circle.svg';
  import stop from '$lib/Images/stop-circle.svg';
  import nexticon from "$lib/Images/nexticon.svg";
  import { workoutStore } from '$lib/store/workoutStore';
  import { allWorkouts } from '$lib/store/allWorkouts';
  import { fetchAltExercises } from '$lib/utils/api/fetchAllExercises';
  import { workoutDetails } from '$lib/store/workoutDetailsStore';
  import { getToken } from '$lib/store/authStore';

  // Type Definitions
  type ExerciseStats = {
    [key: string]: {
      rep_done: number;
      score: number;
      timestamp: string;
    };
    total_time?: number;
    holding_time?: number;
    relaxation_time?: number;
    transition_time?: number;
  };

  type WorkoutSummary = {
    yoga_name: string;
    reps: number;
    score: number;
    time: number;
    exercises: ExerciseStats;
    summaryJson: string;
  };

  type Segment = {
    start: number;
    end: number;
    phase: string;
    thresholds: number[];
    facing: string;
    type: string;
    handlerKey?: string;
  };

  type ExercisePlan = {
    [key: string]: {
      json_data: any;
      reps: number;
    };
  };

  // Variables
  let count = 0;
  let jsonDump: string = '';
  let showTransitionLoading = false;
  let nextExerciseTitle = '';
  let transitionProgress = 0;
  const TRANSITION_DURATION = 5000;
  let transitionTimeout: NodeJS.Timeout | null = null;
  let analysisPaused = false;
  let loadingProgress = 0;
  let loadingTotal = 1;
  let showProgressBar = false;
  let progressValue = 0;
  let drawerState: 'partial' | 'full' = 'partial';
  let elapsedMs: number = 0;
  let dimensions: string = 'Waiting for camera...';
  let poseLandmarker: PoseLandmarker | undefined;
  let runningMode: 'VIDEO' = 'VIDEO';
  let webcam: HTMLVideoElement;
  let output_canvas: HTMLCanvasElement;
  let canvasCtx: CanvasRenderingContext2D;
  let animationFrame: number;
  let containerElement: HTMLDivElement;
  let stream: MediaStream | null = null;
  let isMobile: boolean = false;
  let drawingUtils: DrawingUtils | null = null;
  let status: 'stopped' | 'playing' | 'paused' = 'stopped';
  let sessionStartTime: number | null = null;
  let totalPausedTime = 0;
  let pauseStartTime: number | null = null;
  let userInPosition = false;
  let targetBox = { x: 0, y: 0, width: 0, height: 0 };
  let currentReps: number = 0;
  let currentScore: number = 0;
  let detectPoseActive = true;
  let lastPhase: string | null = null;
  let currentPhase: string | null = null;
  let showPhase: boolean = false;
  let phaseTimeout: NodeJS.Timeout | null = null;
  let showModal = false;
  let isInitialized = false;
  let workoutJson = null;
  let yogName: string = "YogaName";
  let showInstructionalModal = false;
  let exerciseData: Array<{ name: string; reps: number; altData: any }> = [];
  let filteredExercises: Array<{ name: string; reps: number; altData: any }> = [];
  let exerciseStats: ExerciseStats = {};
  let currentExerciseName: string = '';
  let transitionKeypoints: any = null;
  let canvasContext: CanvasRenderingContext2D | null = null;
  let safeWidth = window.innerWidth;
  let safeHeight = window.innerHeight;

  // Controller Instance
  let controller: Controller | null = null;
  let operationId = 0;
  let currentTime = 0;
  let controllerInitialized = false;
  let progressInterval: NodeJS.Timeout | null = null;

  // Helper Functions
  function drawSelectedKeypointsAndLines(ctx, keypoints, indices, opts = {}) {
    const { color = 'red', lineType = 'solid', pointRadius = 5 } = opts;

    if (!keypoints || !Array.isArray(keypoints) || !indices || !Array.isArray(indices) || indices.length < 1) {
      return;
    }

    const canvas = ctx.canvas;
    const W = canvas.width;
    const H = canvas.height;

    ctx.fillStyle = color;
    for (const idx of indices) {
      const pt = keypoints[idx];
      if (!pt) continue;
      const [nx, ny] = pt;
      const cx = nx * W;
      const cy = ny * H;
      ctx.beginPath();
      ctx.arc(cx, cy, pointRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    if (indices.length > 1) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;

      if (lineType === 'dotted') {
        ctx.setLineDash([5, 5]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      let first = true;
      for (const idx of indices) {
        const pt = keypoints[idx];
        if (!pt) continue;
        const [nx, ny] = pt;
        const cx = nx * W;
        const cy = ny * H;
        if (first) {
          ctx.moveTo(cx, cy);
          first = false;
        } else {
          ctx.lineTo(cx, cy);
        }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function detectMobileDevice(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  function getConstraints(): MediaStreamConstraints {
    isMobile = detectMobileDevice();
    return {
      video: { facingMode: 'user' },
      audio: false
    };
  }

  function formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' + seconds : seconds}`;
  }

  function calculateDtwScore(p1, p2){
    if (!Array.isArray(p1[0])) p1 = [p1];
    if (!Array.isArray(p2[0])) p2 = [p2];
    if (p1.length !== p2.length) {
        throw new Error("Point arrays must be the same length");
    }

    let sum = 0;                              
    const n = p1.length;                        

    for (let i = 0; i < n; i++) {                
        const dx = p2[i][0] - p1[i][0];
        const dy = p2[i][1] - p1[i][1];
        sum += Math.hypot(dx, dy);                 
    }

    return { dtwDistance: sum / n };  
  }
  export function checkPoseSuccess(idealKeypoints, normalizedKeypoints, thresholds) {
    if (!normalizedKeypoints) return false;

    // the 10 keypoint indices we care about:
    const indices = [
      16, // right wrist
      15, // left wrist
      11, // left shoulder
      12, // right shoulder
      13, // left elbow
      14, // right elbow
      25, // left knee
      26, // right knee
      27, // left ankle
      28  // right ankle
    ];

    let underThresholdCount = 0;

    for (const idx of indices) {
      const { dtwDistance } = calculateDtwScore(
        [idealKeypoints[idx]],
        [normalizedKeypoints[idx]]
      );
      if (dtwDistance < thresholds[idx]) {
        underThresholdCount++;
      }
    }
    console.log("No of success points:", underThresholdCount);
    // success if at least 8 of the 10 keypoints are "close enough"
    return underThresholdCount >= 8;
  }


  /**
   * Calculate the Euclidean distance between two 2D points.
   *
   * @param {number[]} p1  An array [x1, y1].
   * @param {number[]} p2  An array [x2, y2].
   * @returns {number}     The distance = √((x2–x1)² + (y2–y1)²).
   */
  function calculateEuclideanDistance(p1, p2) {
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    return Math.hypot(dx, dy);
  }

  export function checkBendback(ctx, idealKeypoints, normalizedKeypoints, hipPoint, thresholds, curr_phase = null) {
    if (!normalizedKeypoints) {
        // printTextOnFrame(ctx, 'Keypoints not detected', { x: 50, y: 50 }, 'red');
        return [ctx, false];
    }

      const { dtwDistance: dtwRightWrist } = calculateDtwScore([idealKeypoints[16]], [normalizedKeypoints[16]]);
      const { dtwDistance: dtwLeftWrist } = calculateDtwScore([idealKeypoints[15]], [normalizedKeypoints[15]]);
      const { dtwDistance: dtwLeftShoulder } = calculateDtwScore([idealKeypoints[11]], [normalizedKeypoints[11]]);
      const { dtwDistance: dtwRightShoulder } = calculateDtwScore([idealKeypoints[12]], [normalizedKeypoints[12]]);
      const { dtwDistance: dtwLeftElbow } = calculateDtwScore([idealKeypoints[13]], [normalizedKeypoints[13]]);
      const { dtwDistance: dtwRightElbow } = calculateDtwScore([idealKeypoints[14]], [normalizedKeypoints[14]]);
      const { dtwDistance: dtwLeftKnees } = calculateDtwScore([idealKeypoints[25]], [normalizedKeypoints[25]]);
      const { dtwDistance: dtwRightKnees } = calculateDtwScore([idealKeypoints[26]], [normalizedKeypoints[26]]);
      const { dtwDistance: dtwLeftAnkle } = calculateDtwScore([idealKeypoints[25]], [normalizedKeypoints[25]]);
      const { dtwDistance: dtwRightAnkle } = calculateDtwScore([idealKeypoints[26]], [normalizedKeypoints[26]]);

      const LeftWristTh    = thresholds[15] * calculateEuclideanDistance(idealKeypoints[15], idealKeypoints[23]);
      const RightWristTh   = thresholds[16] * calculateEuclideanDistance(idealKeypoints[16], idealKeypoints[23]);
      const LeftShoulderTh = thresholds[11] * calculateEuclideanDistance(idealKeypoints[11], idealKeypoints[23]);
      const RightShoulderTh= thresholds[12] * calculateEuclideanDistance(idealKeypoints[12], idealKeypoints[23]);
      const LeftElbowTh    = thresholds[13] * calculateEuclideanDistance(idealKeypoints[13], idealKeypoints[23]);
      const RightElbowTh   = thresholds[14] * calculateEuclideanDistance(idealKeypoints[14], idealKeypoints[23]);
      const LeftKneeTh     = thresholds[25] * calculateEuclideanDistance(idealKeypoints[25], idealKeypoints[23]);
      const RightKneeTh    = thresholds[26] * calculateEuclideanDistance(idealKeypoints[26], idealKeypoints[23]);
      const LeftAnkleTh    = thresholds[27] * calculateEuclideanDistance(idealKeypoints[27], idealKeypoints[23]);
      const RightAnkleTh   = thresholds[28] * calculateEuclideanDistance(idealKeypoints[28], idealKeypoints[23]);
      const modified = {
          11: LeftShoulderTh,
          12: RightShoulderTh,
          13: LeftElbowTh,
          14: RightElbowTh,
          15: LeftWristTh,
          16: RightWristTh,
          25: LeftKneeTh,
          26: RightKneeTh,
          27: LeftAnkleTh,
          28: RightAnkleTh
      };

      // build the new thresholds array in order 0…(thresholds.length-1):
      const thresholds_new = thresholds.map((oldTh, i) =>
        // if we have a modified value for index i, use it; otherwise keep oldTh
        modified.hasOwnProperty(i)
            ? modified[i]
            : oldTh
        );

        const scores = {
            'Hand': { value: dtwLeftWrist, threshold: LeftWristTh },
            'Shoulder': { value: dtwLeftShoulder, threshold: LeftShoulderTh }
        };
        // drawDtwScores(ctx, scores);

        const trackedIndices = [
            11, // L shoulder
            12, // R shoulder
            13, // L elbow
            14, // R elbow
            15, // L wrist
            16, // R wrist
            25, // L knee
            26, // R knee
            27, // L ankle
            28  // R ankle
        ];

        // precompute hip as your “origin” in normalized space & pixel space:
        const hipNorm = hipPoint; // [hx, hy] normalized
        const width   = ctx.canvas.width;
        const height  = ctx.canvas.height;
        const hipPix  = [ hipNorm[0]*width, hipNorm[1]*height ];

        // loop over each index
        trackedIndices.forEach(idx => {
        // 1) get relative normalized coords
        const userRel  = normalizedKeypoints[idx]; // [dx, dy]
        const idealRel = idealKeypoints[idx];      // [dx, dy]
        // console.log("Here are the userRel: ", userRel);
        // console.log("Here are the idealRel: ", idealRel);
        

        // 2) reconstruct absolute normalized coords
        // console.log("Here are the hipNorm: ", hipNorm);
        const userNorm  = [ userRel[0]  + hipNorm[0],  userRel[1]  + hipNorm[1] ];
        const idealNorm = [ idealRel[0] + hipNorm[0],  idealRel[1] + hipNorm[1] ];
        // console.log("Here are the userNorm: ", userNorm);
        // console.log("Here are the idealNorm: ", idealNorm);  
        // 3) convert to pixel space
        const userPix  = [ userNorm[0]  * width, userNorm[1]  * height ];
        const idealPix = [ idealNorm[0] * width, idealNorm[1] * height ];

        // 4) log them
        // console.log(
        //     `Index ${idx} — User pixel: (${userPix[0].toFixed(1)}, ${userPix[1].toFixed(1)})`,
        //     `Ideal pixel: (${idealPix[0].toFixed(1)}, ${idealPix[1].toFixed(1)})`
        // );
        if(curr_phase == null){
          // (optional) draw guidance circle + arrow for each joint:
          const DistPix = calculateEuclideanDistance(hipPix, idealPix);
          const radius  = thresholds[idx] * DistPix;  
          ctx.beginPath();
          ctx.arc(idealPix[0], idealPix[1], radius, 0, Math.PI*2);
          ctx.strokeStyle = "#FF0000";
          ctx.lineWidth   = 2;
          ctx.stroke();
          // arrow
          ctx.beginPath();
          ctx.moveTo(userPix[0], userPix[1]);
          ctx.lineTo(idealPix[0], idealPix[1]);
          ctx.strokeStyle = "yellow";
          ctx.lineWidth   = 3;
          ctx.stroke();
          // arrowhead
          const angle     = Math.atan2(idealPix[1]-userPix[1], idealPix[0]-userPix[0]);
          const arrowSize = 10;
          ctx.beginPath();
          ctx.moveTo(idealPix[0], idealPix[1]);
          ctx.lineTo(
              idealPix[0] - arrowSize*Math.cos(angle + Math.PI/6),
              idealPix[1] - arrowSize*Math.sin(angle + Math.PI/6)
          );
          ctx.moveTo(idealPix[0], idealPix[1]);
          ctx.lineTo(
              idealPix[0] - arrowSize*Math.cos(angle - Math.PI/6),
              idealPix[1] - arrowSize*Math.sin(angle - Math.PI/6)
          );
          ctx.stroke();
        }
        
      });

      const success = checkPoseSuccess(idealKeypoints, normalizedKeypoints, thresholds_new);
      return [ctx, success];
  }

  function normalizeKeypoints(landmarks) {
    if (!landmarks || !Array.isArray(landmarks) || landmarks.length < 33) {
      console.warn('Invalid landmarks data:', landmarks);
      
      return null;
    }

    const keypoints = landmarks.map((lm) => {
      if (typeof lm === 'object' && lm.x !== undefined) {
        return [lm.x || 0, lm.y || 0, lm.z || 0];
      }
      return [lm[0] || 0, lm[1] || 0, lm[2] || 0];
    });

    const hip = keypoints[24];
    if (!hip || hip.some((coord) => coord === undefined)) {
      console.warn('Hip keypoint is invalid:', hip);
      return null;
    }

    const normalized = keypoints.map((point) => [
      point[0] - hip[0],
      point[1] - hip[1],
      point[2] - hip[2]
    ]);

    return [normalized, hip];
  }

  function denormalizeKeypoints(normalized, hip) {
    if (!Array.isArray(normalized) || normalized.length < 33) {
      console.warn('Invalid normalized data:', normalized);
      return null;
    }
    if (!Array.isArray(hip) || hip.length < 3) {
      console.warn('Invalid hip data:', hip);
      return null;
    }

    return normalized.map((point) => [
      (point[0] || 0) + hip[0],
      (point[1] || 0) + hip[1],
      (point[2] || 0) + hip[2]
    ]);
  }

  function calculateNormal(p1, p2, p3) {
    const v1 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
    const v2 = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]];

    const normal = [
      v1[1] * v2[2] - v1[2] * v2[1],
      v1[2] * v2[0] - v1[0] * v2[2],
      v1[0] * v2[1] - v1[1] * v2[0]
    ];

    const normMagnitude = Math.sqrt(normal.reduce((sum, val) => sum + val * val, 0));
    const result = normMagnitude !== 0 ? normal.map((val) => val / normMagnitude) : [0, 0, 0];
    return result;
  }

  function detectFacing(landmarks, xThreshold = 0.5, yThreshold = 0.5, zThreshold = 0.5) {
    const normalized = normalizeKeypoints(landmarks);
    const keypoints = normalized?.[0];
    if (!keypoints) {
      console.warn('No keypoints available for facing detection');
      return 'random';
    }

    const leftShoulder = keypoints[11];
    const rightShoulder = keypoints[12];
    const rightHip = keypoints[24];

    if (!leftShoulder || !rightShoulder || !rightHip) {
      console.warn('Missing critical keypoints for facing detection');
      return 'random';
    }

    const [nx, ny, nz] = calculateNormal(leftShoulder, rightShoulder, rightHip);
    const absNx = Math.abs(nx), absNy = Math.abs(ny), absNz = Math.abs(nz);

    const directions = {
      x: [nx > 0 ? 'left' : 'right', absNx, xThreshold],
      y: [ny > 0 ? 'up' : 'down', absNy, yThreshold],
      z: [nz > 0 ? 'back' : 'front', absNz, zThreshold]
    };

    const [direction, magnitude, threshold] = Object.values(directions).reduce(
      (max, curr) => (curr[1] > max[1] ? curr : max),
      ['', -1, 0]
    );

    return magnitude > threshold ? direction : 'random';
  }

  function checkKeypointVisibility(landmarks) {
    if (!landmarks || landmarks.length < 33) {
      console.warn('Landmarks incomplete for visibility check:', landmarks);
      return [false, ['all']];
    }
    const missing = [];
    for (let i = 0; i < landmarks.length; i++) {
      if (!landmarks[i].visibility || landmarks[i].visibility < 0.0) {
        missing.push(i);
      }
    }
    return [missing.length === 0, missing];
  }

  // Controller Classes
  class BasePhase {
    constructor(controller) {
      this.controller = controller;
      this.holdDuration = 0;
      this.normalizedKeypoints = null;
      this.hipPoint = 0;
    }

    process(currentTime) {
      throw new Error('Not implemented');
    }
  }

  class StartPhase extends BasePhase {
    constructor(controller, targetFacing) {
      super(controller);
      this.targetFacing = targetFacing;
      this.start_time = null;
    }

    process(currentTime) {
      const detectedFacing = this.controller.landmarks
        ? detectFacing(this.controller.landmarks)
        : 'random';
      const phase = this.controller.segments[this.controller.currentSegmentIdx].phase;
      const expertKeypoints = this.controller.getIdealKeypoints(this.targetFacing);
      const idealStartingKeypoints = this.controller.getNextIdealKeypoints('starting', 0);
      this.thresholds = this.controller.segments[0].thresholds;
      const [_, success] = checkBendback(
        canvasContext,
        idealStartingKeypoints,
        this.controller.normalizedKeypoints,
        this.controller.hipPoint,
        this.thresholds
      );
      if (success && detectedFacing === this.targetFacing) {
        if (this.start_time == null) {
          this.start_time = currentTime;
        } else {
          if (currentTime - this.start_time >= this.holdDuration) {
            return [phase, true];
          }
        }
      }
      return [phase, false];
    }
  }

  class TransitionPhase extends BasePhase {
    constructor(controller, startFacing) {
      super(controller);
      this.transitionTimeout = 5;
      this.startFacing = startFacing;
      // this.transitionAnalyzer  = transitionAnalyzer;
      this.thresholds = null;
      this.phaseStartTime = null;
      this._queueSegmentIdx = null;
      this._pointQueue      = [];
      this._originalLength  = 0;
    }
    _toPixelCoords(point, width, height) {
      const x = point.x != null ? point.x : (point[0] != null ? point[0] : 0);
      const y = point.y != null ? point.y : (point[1] != null ? point[1] : 0);
      return [ x * width, y * height ];
    }
    process(currentTime) {
      this.phaseStartTime = currentTime;
      const elapsedMs = currentTime - this.controller.startTime;
      const elapsedSec = elapsedMs / 1000;
      const timeLeft = this.transitionTimeout - elapsedMs;
      const ctx       = this.controller.frame;
      const currIdx   = this.controller.currentSegmentIdx;
      const nextIdx   = currIdx + 1;
      const nextSeg   = this.controller.segments[nextIdx];
      const phase     = nextSeg.phase;
      const thresholds= nextSeg.thresholds;
      const idealKps = this.controller.getNextIdealKeypoints(phase, nextIdx);
      let [ ctxAfterPosture, postureGood ] = checkBendback(
        canvasContext,
        idealKps,
        this.controller.normalizedKeypoints,
        this.controller.hipPoint,
        thresholds,
        "Transition_phase"
      );
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
        const prevSeg = this.controller.segments[currIdx-1] || {};
        const prevThresh = prevSeg.thresholds;
        const prevIdealAll = this.controller.getPrevIdealKeypoints(currIdx-1);

        if (prevThresh) {
          for (let i = s; i < e; i++) {
            const ideal = this.controller.yoga.getIdealKeypoints(i, i+1)[0];
            const denorm= denormalizeKeypoints(ideal, hip);

            // if the previous‐segment posture fails, queue this frame
            const [ ctx, ok ] = checkBendback(
              ctxAfterPosture,
              prevIdealAll,
              ideal,
              hip,
              prevThresh
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
          const pt = frame[LEFT_WRIST] || frame;
          if (!pt) continue;
          const [ tx, ty ] = this._toPixelCoords(pt, canvasContext.canvas.width, canvasContext.canvas.height);
          canvasContext.beginPath();
          canvasContext.arc(tx, ty, 8, 0, Math.PI*2);
          canvasContext.strokeStyle = 'cyan';
          canvasContext.lineWidth   = 2;
          canvasContext.stroke();
        }

        // check user wrist vs next target
        const target = this._pointQueue[0][LEFT_WRIST];
        const [ tx, ty ] = this._toPixelCoords(target, canvasContext.canvas.width, canvasContext.canvas.height);
        const userRel = nk[LEFT_WRIST];
        const [ ux, uy ] = this._toPixelCoords(
          [ userRel[0] + hip[0], userRel[1] + hip[1] ],
          canvasContext.canvas.width, ctcanvasContextx.canvas.height
        );

        if (Math.hypot(tx-ux, ty-uy) <= 40) {
          this._pointQueue.shift();
        }

        const done    = this._originalLength - this._pointQueue.length;
        const ratio   = done / this._originalLength;
        pathGood = ratio >= 0.7;

          if (pathGood) {
          // clear for next segment
            this._pointQueue = [];
            this._queueSegmentIdx = null;
          }
        }
      }

      // finalize and return
      this.controller.frame = ctxAfterPosture;
      const success = postureGood && pathGood;

      // extra safety reset
      if (elapsedMs >= this.transitionTimeout) {
        this.controller.currentSegmentIdx = 0;
      }

      return [ phase, success ];
    }
  }

  class HoldingPhase extends BasePhase {
    constructor(controller, thresholds, startFacing) {
      super(controller);
      this._resetTimers();
      this.startFacing = startFacing;
      this.thresholds = thresholds;
      this.holdStartTime = null;
      this.successDuration = 0;
      this.minHoldDuration = 1;
      this.completedHold = false;
      this.exitThresholdMultiplier = 0.8;
      this.leavePoseTime = null;
      this.phaseEntryTime = null;
      this.doneonce = false;
    }

    _resetTimers() {
      this.holdStartTime = null;
      this.successDuration = 0;
      this.completedHold = false;
      this.leavePoseTime = null;
      this.phaseEntryTime = null;
      this.doneonce = false;
    }

    process(currentTime) {
      if (this.phaseEntryTime === null) {
        this.phaseEntryTime = currentTime;
      }

      if (this.controller.lastHoldingIdx !== -1 && 
          this.controller.currentSegmentIdx > this.controller.lastHoldingIdx && 
          this.controller.transitionKeypoints.length) {
          // Gather ideal vs. actual transition keypoints
          const idealTransKeypoints = this.controller.getTransitionKeypoints(this.controller.lastHoldingIdx, this.controller.currentSegmentIdx);
          if (idealTransKeypoints.length && this.controller.transitionKeypoints.length) {
              // Compare up to the shorter length
              const minLen = Math.min(this.controller.transitionKeypoints.length, idealTransKeypoints.length);
              const userTrans = this.controller.transitionKeypoints.slice(0, minLen).flat();
              const idealTrans = idealTransKeypoints.slice(0, minLen).flat();
              const { dtwDistance } = calculateDtwScore(userTrans, idealTrans);
              const color = dtwDistance < 50 ? 'green' : 'red';
              // Overlay the transition DTW score
              printTextOnFrame(this.controller.frame, `Transition DTW: ${dtwDistance.toFixed(2)}`, { x: 10, y: 120 }, color);
          }
      }

      // 3) If normalized keypoints are available, run posture check
      if (this.controller.normalizedKeypoints) {
          // checkBendback returns updated context and success boolean
          const [ctx, success] = checkBendback(this.controller.frame, idealKeypoints, this.controller.normalizedKeypoints, this.controller.hipPoint, this.thresholds);
          console.log(`Success in holding frame ${success}`);
          this.controller.frame = ctx;
          // Compute overall DTW on the whole pose for guidance
          const { dtwDistance: dtwWhole } = calculateDtwScore(idealKeypoints, this.controller.normalizedKeypoints);
          const { dtwHands: dtwHands } = calculateDtwScore(idealKeypoints, this.controller.normalizedKeypoints);
          
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
              return [ 'holding', false ];
          }
          } else {
              // either success or already completedHold
              this.leavePoseTime = null;
          }
          // Draw DTW scores
          const scores = {
              [phase]: { value: dtwWhole, threshold: this.thresholds[0] }
          };
          // drawDtwScores(this.controller.frame, scores);
          if (success) {
              if (!this.holdStartTime) this.holdStartTime = currentTime;
              this.successDuration = currentTime - this.holdStartTime;
              // printTextOnFrame(this.controller.frame, `Holding ${phase} (${this.successDuration.toFixed(1)}s)`, { x: 10, y: 60 }, 'green');
              if(this.doneonce = false){
                  for (let i = 0; i < this.thresholds.length; i++) {
                      this.thresholds[i] *= this.exitThresholdMultiplier;
                  }
                  this.doneonce = true;
              }
              
              if (this.successDuration >= this.minHoldDuration && !this.completedHold) {
                  this.completedHold = true;
                  // printTextOnFrame(this.controller.frame, 'Hold completed, stay or adjust to exit', { x: 10, y: 90 }, 'green');
              }
          } else {
              if (this.completedHold && !success) {
                  const phaseName = phase.split('_')[1] || phase;
                  // printTextOnFrame(this.controller.frame, `${phaseName} completed, exiting hold (DTW: ${dtwWhole.toFixed(2)})`, { x: 10, y: 60 }, 'green');
                  console.log('Holding phase completed');
                  
                  this._resetTimers();
                  return [phase, true];
              }
              if (!this.completedHold) {
                  this.holdStartTime = null;
                  this.successDuration = 0;
                  // printTextOnFrame(this.controller.frame, 'Adjust pose to hold', { x: 10, y: 60 }, 'red');
              } else {
                  // printTextOnFrame(this.controller.frame, `Hold completed, stay or adjust to exit (DTW: ${dtwWhole.toFixed(2)})`, { x: 10, y: 60 }, 'green');
              }
          }
      } else {
          // printTextOnFrame(this.controller.frame, 'Adjust pose', { x: 10, y: 60 }, 'red');
          this.holdStartTime = null;
          this.successDuration = 0;
          this.completedHold = false;
      }
      return[ this.controller.segments[this.controller.currentSegmentIdx].phase, false ];
    }
  }

  class EndingPhase extends BasePhase {
    constructor(controller, targetFacing) {
      super(controller);
      this.targetFacing = targetFacing;
      this.thresholds = null;
    }

    process(currentTime) {
      const detectedFacing = this.controller.landmarks
        ? detectFacing(this.controller.landmarks)
        : 'random';
      const phase = this.controller.segments[this.controller.currentSegmentIdx].phase;
      const idealEndingKeypoints = this.controller.getNextIdealKeypoints('starting', 0);
      this.thresholds = this.controller.segments[0].thresholds;
      const [_, success] = checkBendback(
        canvasContext,
        idealEndingKeypoints,
        this.controller.normalizedKeypoints,
        this.controller.hipPoint,
        this.thresholds
      );
      if (success && detectedFacing === this.targetFacing) {
          
          return [phase, true];
      }
      return [phase, false];
    }
  }

  class RelaxationPhase extends BasePhase {
    constructor(controller) {
      super(controller);
      this.currentFeedback = 'Relax and breathe';
      this.phaseEntryTime = null;
    }

    process(currentTime) {
      // canvasCtx.clearRect(0, 0, canvasCtx.canvas.width, canvasCtx.canvas.height);
      if (this.phaseEntryTime === null) {
        this.phaseEntryTime = currentTime;
      }
      this.controller.transitionKeypoints = [];
      this.controller.lastHoldingIdx = -1;
      const durationMs = currentTime - this.phaseEntryTime;
      const durationSec = (durationMs / 1000).toFixed(2);

      this.controller.total_time += durationMs;
      this.controller.relaxation_time += durationMs;

      return {
        phase: 'relaxation',
        completed: this.shouldExitRelaxation()
      };
    }

    shouldExitRelaxation() {
      const startSegment = this.controller.segments.find((s) => s.type === 'starting');
      if (!startSegment) return false;

      const expertKeypoints = this.controller.getIdealKeypoints(startSegment.phase);
      const userKeypoints = this.controller.normalizedKeypoints;
      const distance = calculateEuclideanDistance(userKeypoints, expertKeypoints);

      const THRESHOLD = 2;
      const userFacing = this.controller.landmarks ? detectFacing(this.controller.landmarks) : null;

      return distance < THRESHOLD && userFacing === startSegment.facing;
    }
  }

  class YogaDataExtractor {
    constructor(jsonData) {
      this.data = jsonData;
      this.keypointsData = jsonData?.frames || [];
      this.segmentsData = jsonData?.segments || [];
      this.loadPromise = this.ensureLoaded();
    }

    async ensureLoaded() {
      if (!this.data || !this.segmentsData || !this.keypointsData) {
        console.warn('JSON data not properly provided');
        this.data = { frames: [], segments: [] };
        this.keypointsData = [];
        this.segmentsData = [];
      }
    }

    segments() {
      if (!this.data || !this.segmentsData || !Array.isArray(this.segmentsData)) {
        console.warn('Segments data not available:', this.segmentsData);
        return [];
      }

      const segments = this.segmentsData
        .map((s) => {
          try {
            const idealKeypoints = this.getIdealKeypoints(s[0], s[1]);
            const middleIdx = Math.floor(idealKeypoints.length / 2);
            const keypointsFrame = idealKeypoints[middleIdx] || [];
            const segment = {
              start: s[0],
              end: s[1],
              phase: s[2],
              thresholds: s[3],
              facing: detectFacing(keypointsFrame),
              type: s[2].split('_')[0],
              RepresentativeFrame: s[5].representativeFrame
            };
            return segment;
          } catch (e) {
            console.error(`Invalid segment: ${s}`, e);
            return null;
          }
        })
        .filter((s) => s !== null);
      return segments;
    }

    getIdealKeypoints(startFrame, endFrame) {
      if (!this.keypointsData || !Array.isArray(this.keypointsData)) {
        console.warn('No keypoints data available');
        return [];
      }
      const subData = this.keypointsData.slice(startFrame, endFrame);
      return subData.map((frame) =>
        frame.map((kp) => {
          const [x, y, z] = kp.split(',').slice(0, 3).map(parseFloat);
          return [x || 0, y || 0, z || 0];
        })
      );
    }
  }

  class TransitionAnalyzer {
    constructor(jsonData, yogaName) {
      this.yoga = new YogaDataExtractor(jsonData);
      this.yogaName = yogaName;
      this.segments = this.yoga.segments();
      this.transitionPaths = this._createTransitionPaths();
    }

    _createTransitionPaths() {
      const transitionPaths = [];
      const holdingIndices = this.segments
        .map((seg, i) =>
          seg.type === 'starting' || seg.type === 'holding' || seg.type === 'ending' ? i : -1
        )
        .filter((i) => i !== -1);

      for (let i = 0; i < holdingIndices.length - 1; i++) {
        const startIdx = holdingIndices[i];
        const endIdx = holdingIndices[i + 1];
        const startFrame = this.segments[startIdx].end;
        const endFrame = this.segments[endIdx].start;
        if (startFrame >= endFrame) continue;

        const idealKeypoints = this.yoga.getIdealKeypoints(startFrame, endFrame);
        if (!idealKeypoints.length) continue;

        const leftWristKeypoints = idealKeypoints.map((frame) => frame[15]);
        const threshold = this.segments[endIdx].thresholds
          ? this.segments[endIdx].thresholds[0]
          : 0.1;
        transitionPaths.push({
          startSegmentIdx: startIdx,
          endSegmentIdx: endIdx,
          startFrame,
          endFrame,
          leftWristPath: leftWristKeypoints,
          threshold
        });
      }
      return transitionPaths;
    }

    analyzeTransition(userKeypoints, currentSegmentIdx) {
      const userLeftWrist = userKeypoints[15];
      for (const path of this.transitionPaths) {
        if (currentSegmentIdx > path.startSegmentIdx && currentSegmentIdx < path.endSegmentIdx) {
          const distances = path.leftWristPath.map((p) =>
            Math.hypot(userLeftWrist[0] - p[0], userLeftWrist[1] - p[1])
          );
          const minDistance = Math.min(...distances);
          const withinPath = minDistance <= path.threshold;
          return withinPath;
        }
      }
      return false;
    }

    getTransitionEndTarget(currentSegmentIdx) {
      for (const path of this.transitionPaths) {
        if (currentSegmentIdx > path.startSegmentIdx && currentSegmentIdx <= path.endSegmentIdx) {
          return path.leftWristPath[path.leftWristPath.length - 1];
        }
      }
      return [0, 0, 0];
    }
  }

  class Controller {
    constructor(exercisePlan) {
      this.lastValidPoseTime = performance.now();
      this.inRelaxation = false;
      this.relaxationEnteredTime = 0;
      this.relaxationThreshold = 5;
      this.relaxationSegmentIdx = 0;

      this.exercisePlan = exercisePlan;
      this.currentExerciseIdx = 0;
      this.exerciseNames = Object.keys(exercisePlan);
      this.currentExercise = this.exerciseNames[this.currentExerciseIdx];
      this.jsonData = exercisePlan[this.currentExercise].json_data;
      this.targetReps = exercisePlan[this.currentExercise].reps;

      this.yoga = new YogaDataExtractor(this.jsonData);
      this.segments = this.yoga.segments();
      this.currentSegmentIdx = 0;

      this.phaseHandlers = this._initializeHandlers();

      this.count = 0;
      this.startTime = performance.now();
      this.currentRepStartTime = null;

      this.landmarks = null;
      this.normalized = null;
      this.normalizedKeypoints = null;
      this.hipPoint = 0;
      this.transitionKeypoints = [];
      this.workoutCompleted = false;
      this.exerciseChanged = false;
      this.lastValidHoldTime = 0;
      this.phaseTimeouts = {
        transition: 10000,
        holdingAbandonment: 5000,
        holdingDuration: 5000
      };
      this.lostPoseWarned = false;
      this.currentExpertKeypoints = null;
      this.lastHoldingIdx = -1;
      this.transitionAnalyzer = new TransitionAnalyzer(this.jsonData, this.currentExercise);
      this.score = 100;
      this.total_time = 0;
      this.holding_time = 0;
      this.relaxation_time = 0;
      this.transition_time = 0;
    }

    async initialize() {
      await this.yoga.ensureLoaded();
      this.segments = this.yoga.segments();
      if (this.segments.length === 0) {
        console.error('No segments available, exercise cannot start');
        return;
      }
      this.phaseHandlers = this._initializeHandlers();
      integrateWithController(this, this.transitionAnalyzer);
    }

    _initializeHandlers() {
      const handlers = {};
      this.segments.forEach((segment, i) => {
        const {
            phase,
            type: phaseType,
            facing: startFacing,

        } = segment;
        const uniqueKey = `${phase}_${i}`;

        if (phaseType === 'starting') {
          handlers[uniqueKey] = new StartPhase(this, startFacing);
        } else if (phaseType === 'transition') {
          handlers[uniqueKey] = new TransitionPhase(this, startFacing);
        } else if (phaseType === 'holding') {
          handlers[uniqueKey] = new HoldingPhase(this, segment.thresholds, startFacing);
        } else if (phaseType === 'ending') {
          handlers[uniqueKey] = new EndingPhase(this, startFacing);
        } else if (phaseType === 'relaxation') {
          handlers[uniqueKey] = new RelaxationPhase(this, startFacing);
        }
        segment.handlerKey = uniqueKey;
      });
      return handlers;
    }

    getExcerciseName() {
      return this.currentExercise;
    }

    startExerciseSequence() {
      console.log(`Starting exercise sequence for ${this.currentExercise}`);
    }

    update_phase_handlers_frame() {
      for (const handlerKey of Object.keys(this.phaseHandlers)) {
        this.phaseHandlers[handlerKey].normalizedKeypoints = this.normalizedKeypoints;
        this.phaseHandlers[handlerKey].hipPoint = this.hipPoint;
      }
    }

    updateFrame(results) {
      this.results = results;

      if (!results) {
        canvasContext.clearRect(0, 0, canvasContext.canvas.width, canvasContext.canvas.height);
        return;
      }

      if (!results.poseLandmarks || results.poseLandmarks.length === 0) {
        if (!this.lostPoseWarned) {
          console.warn('No pose landmarks detected (first warning)');
          this.lostPoseWarned = true;
        }
        this.landmarks = null;
        this.normalizedKeypoints = null;
        this.update_phase_handlers_frame();
        return;
      }

      if (this.lostPoseWarned) {
        this.lostPoseWarned = false;
      }

      this.landmarks = results.poseLandmarks;
      const [allVisible, missing] = checkKeypointVisibility(this.landmarks);

      if (allVisible) {
        this.lastValidPoseTime = performance.now();

        [this.normalizedKeypoints, this.hipPoint] = normalizeKeypoints(this.landmarks);
        this.update_phase_handlers_frame();
      } else {
        this.normalizedKeypoints = null;
        canvasContext.clearRect(0, 0, canvasContext.canvas.width, canvasContext.canvas.height);
      }

      this.update_phase_handlers_frame();
    }

    checkPhaseTimeouts(currentTime) {
      const currentSegment = this.segments[this.currentSegmentIdx];

      if (currentSegment.type === 'transition') {
        const elapsed = currentTime - this.startTime;
        if (elapsed > this.phaseTimeouts.transition) {
          this.currentSegmentIdx = 0;
          this.transitionKeypoints = [];
        }
      }

      if (currentSegment.type === 'holding') {
        if (currentTime - this.lastValidHoldTime > this.phaseTimeouts.holdingAbandonment) {
          this.currentSegmentIdx = 0;
        }
      }
    }

    enterRelaxation() {
      this.inRelaxation = true;
      this.currentSegmentIdx = this.relaxationSegmentIdx;
      this.startTime = performance.now();
    }

    handleRepCompletion(currentTime) {
      
      this.count++;
      if (this.count >= this.targetReps) {
        if (this.currentExerciseIdx < this.exerciseNames.length - 1) {
          this.currentExerciseIdx++;
          this.resetForNewExercise();
          this.exerciseChanged = true;
          nextExerciseTitle = this.currentExercise;
          showTransitionLoading = true;
          analysisPaused = true;
          
          if (transitionTimeout) clearTimeout(transitionTimeout);
          transitionTimeout = setTimeout(() => {
            showTransitionLoading = false;
            analysisPaused = false;
          }, TRANSITION_DURATION);
          
          this.exerciseChanged = false;
        } else {
          this.workoutCompleted = true;
          const workoutSummary = {
            total_time: this.total_time,
            relaxation_time: this.relaxation_time,
            transition_time: this.transition_time,
            holding_time: this.holding_time
          };
          exerciseStats = { ...exerciseStats, ...workoutSummary };
          jsonDump = JSON.stringify(exerciseStats, null, 2);
        }
      }

      this.currentSegmentIdx = 0;
      this.startTime = currentTime;
    }

    resetForNewExercise() {
      this.currentExercise = this.exerciseNames[this.currentExerciseIdx];
      this.jsonData = this.exercisePlan[this.currentExercise].json_data;
      this.targetReps = this.exercisePlan[this.currentExercise].reps;
      this.yoga = new YogaDataExtractor(this.jsonData);
      this.segments = this.yoga.segments();
      this.phaseHandlers = this._initializeHandlers();
      this.count = 0;
    }

    shouldEnterRelaxation(currentTime) {
      const current = this.segments[this.currentSegmentIdx];
      const elapsed = currentTime - this.lastValidPoseTime;

      if (!this.landmarks && elapsed > this.relaxationThreshold) {
        return true;
      }

      if (['starting', 'ending'].includes(current?.type)) {
        if (this.landmarks) {
          const target = current.facing || 'front';
          const facing = detectFacing(this.landmarks);
          if (facing != null && facing !== target) {
            return true;
          }
        }
      }

      if (
        current?.type === 'transition' &&
        currentTime - this.startTime > this.phaseTimeouts.transition
      ) {
        return true;
      }

      return false;
    }

    handleRelaxationPhase(currentTime) {
      if (!this.inRelaxation) {
        this.inRelaxation = true;
        this.relaxationEnteredTime = currentTime;
      }

      const handler = new RelaxationPhase(this);
      const { phase, completed } = handler.process(currentTime);

      if (completed || currentTime - this.relaxationEnteredTime > 30000) {
        this.inRelaxation = false;
        this.lastValidPoseTime = currentTime;
      }
    }

    getRelaxationReturnValues() {
      return ['relaxation', this.currentExercise, this.count, this.targetReps];
    }

    processExercise(currentTime) {
      if (!this.segments || this.segments.length === 0) {
        console.error('No segments loaded!');
        return ['error', '', 0, 0];
      }

      if (this.currentSegmentIdx >= this.segments.length) {
        this.currentSegmentIdx = 0;
      }

      if (this.shouldEnterRelaxation(currentTime)) {
        this.handleRelaxationPhase(currentTime);
        return this.getRelaxationReturnValues();
      }

      const currentSegment = this.segments[this.currentSegmentIdx];
      const handler = this.phaseHandlers[currentSegment.handlerKey];

      const [phase, completed] = handler.process(currentTime);

      if (currentSegment.type === 'transition' && this.normalizedKeypoints) {
        this.transitionKeypoints.push(this.normalizedKeypoints);
      }

      if (completed) {
        if (currentSegment.type === 'starting') {
          this.currentSegmentIdx++;
          this.startTime = currentTime;
        } else if (currentSegment.type === 'transition') {
          if (currentTime - this.startTime > 10000) {
            this.currentSegmentIdx = 0;
          } else {
            this.currentSegmentIdx++;
            this.startTime = currentTime;
          }
        } else if (currentSegment.type === 'holding') {
          const newIdx = this.currentSegmentIdx + 1;
          this.currentSegmentIdx = newIdx;
          this.startTime = currentTime;

          const nextSeg = this.segments[newIdx];
          if (nextSeg.type === 'holding') {
            this.phaseHandlers[nextSeg.handlerKey]._resetTimers();
          }
        } else if (currentSegment.type === 'ending') {
          this.handleRepCompletion(currentTime);
        }
      }

      if (currentSegment.type === 'holding' && currentTime - this.lastValidHoldTime > 5000) {
        this.currentSegmentIdx = 0;
      }

      return [phase, this.currentExercise, this.count, this.targetReps];
    }

    getPrevIdealKeypoints(phaseIndex) {
        const segment = this.segments[[phaseIndex]];
        if(!segment) return [];
        const representativeFrame = segment.RepresentativeFrame;
        console.log("New representative frme no is : ", representativeFrame);
        console.log("New representative frme is : ", this.yoga.getIdealKeypoints(representativeFrame, representativeFrame + 1)[0] || []);
    
        return this.yoga.getIdealKeypoints(representativeFrame, representativeFrame + 1)[0] || [];
    }
    getNextIdealKeypoints(phase, segmentidx){
        const segment = this.segments[segmentidx];
        console.log("The segment is : ", segment);
        const representativeFrame = segment.RepresentativeFrame;
        console.log("New representative frme no is : ", representativeFrame);
        console.log("New representative frme is : ", this.yoga.getIdealKeypoints(representativeFrame, representativeFrame + 1)[0] || []);
        
        return this.yoga.getIdealKeypoints(representativeFrame, representativeFrame + 1)[0] || [];
        
    }
    getIdealKeypoints(phase) {
      const segment = this.segments[this.currentSegmentIdx];
      if (segment.phase === phase) {
          const representativeFrame = segment.RepresentativeFrame;
          console.log("New representative frme no is : ", representativeFrame);
          console.log("New representative frme is : ", this.yoga.getIdealKeypoints(representativeFrame, representativeFrame + 1)[0] || []);
      
          return this.yoga.getIdealKeypoints(representativeFrame, representativeFrame + 1)[0] || [];
      }
      return [];
    }

    getTransitionKeypoints(startIdx, endIdx) {
        for (let i = startIdx; i < endIdx; i++) {
            if (this.segments[i].type === 'transition') {
                return this.yoga.getIdealKeypoints(this.segments[i].start, this.segments[i].end);
            }
        }
        return [];
    }
  }

  function integrateWithController(controller, transitionAnalyzer) {
    const originalProcessExercise = controller.processExercise;
    controller.processExercise = function (currentTime) {
      const [phase, exerciseName, count, targetReps] = originalProcessExercise.call(
        this,
        currentTime
      );
      const currentSegment = this.segments[this.currentSegmentIdx];

      if (this.normalizedKeypoints) {
        const userLeftWrist = this.normalizedKeypoints[15];
        for (const path of transitionAnalyzer.transitionPaths) {
          if (
            this.currentSegmentIdx > path.startSegmentIdx &&
            this.currentSegmentIdx <= path.endSegmentIdx
          ) {
            if (
              currentSegment.type !== 'starting' &&
              currentSegment.type !== 'holding' &&
              currentSegment.type !== 'ending'
            ) {
            } else if (
              ['starting', 'holding', 'ending'].includes(currentSegment.type) &&
              path.endSegmentIdx === this.currentSegmentIdx
            ) {
              const handler = this.phaseHandlers[currentSegment.handlerKey];
              const [, completed] = handler.process(currentTime);
            }
          }
        }
      }
      return [phase, exerciseName, count, targetReps];
    };
  }

  // UI Functions
  function handleDrawerToggle() {
    drawerState = drawerState === 'partial' ? 'full' : 'partial';
  }

  async function initPoseLandmarker() {
    const wasmFileset = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'
    );
    const storedLandmarker = $poseLandmarkerStore;
    if (storedLandmarker) {
      poseLandmarker = storedLandmarker;
    } else {
      try {
        const vision = await import('@mediapipe/tasks-vision');
        poseLandmarker = await vision.PoseLandmarker.createFromOptions(
          wasmFileset,  
          {
            baseOptions: {
              modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
              delegate: 'GPU'
            },
            runningMode: 'VIDEO',
            numPoses: 1
          });
        poseLandmarkerStore.set(poseLandmarker);
      } catch (error) {
        console.error('Error initializing pose landmarker:', error);
        dimensions = 'Pose landmarker error: ' + (error as Error).message;
      }
    }

    if (canvasCtx && !drawingUtils) {
      drawingUtils = new DrawingUtils(canvasCtx);
    }
  }

  async function startCamera(): Promise<void> {
    try {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      if (!output_canvas || !canvasCtx || !webcam) {
        console.error('Canvas, context, or webcam not available');
        return;
      }

      isMobile = detectMobileDevice();
      const constraints = getConstraints();

      stream = await navigator.mediaDevices.getUserMedia(constraints).catch(err => {
        console.warn('Failed with initial constraints, falling back to basic config:', err);
        return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      });

      webcam.srcObject = stream;
      await webcam.play();
      dimensions = 'Camera active';
      setupTargetBox();
      detectPoseActive = true;
      renderFrame();
    } catch (error) {
      console.error('Error accessing the camera:', error);
      dimensions = 'Camera error: ' + (error as Error).message;
    }
  }

  function setupTargetBox() {
    if (!output_canvas) return;

    const canvasWidth = output_canvas.width;
    const canvasHeight = output_canvas.height;

    targetBox = {
      x: canvasWidth * 0.02,
      y: canvasHeight * 0.08,
      width: canvasWidth * 0.96,
      height: canvasHeight * 0.90
    };
  }

  function drawTransitionKeypoints(denormKeypoints) {
    if (!denormKeypoints || !canvasContext) return;

    // Clear at the start
    canvasContext.clearRect(0, 0, safeWidth, safeHeight);
    canvasContext.translate(safeWidth, 0);
    canvasContext.scale(-1, 1);
    const connections = [
      [11, 12], [11, 23], [12, 24], [23, 24],
      [24, 26], [26, 28], [23, 25], [25, 27],
      [12, 14], [14, 16], [11, 13], [13, 15]
    ];

    const transitionStyle = {
      lineColor: '#FFA500',       // orange
      lineWidth: 3,
      lineDash: [5, 3],
      pointColor: '#FFA500',      // orange
      pointRadius: 5,
      pointOutline: '#FFFFFF',
      pointOutlineWidth: 1
    };

    // Set up stroke style for lines
    canvasContext.strokeStyle = transitionStyle.lineColor;
    canvasContext.lineWidth = transitionStyle.lineWidth;
    canvasContext.setLineDash(transitionStyle.lineDash);

    // Draw connections
    canvasContext.beginPath();
    connections.forEach(([i, j]) => {
      const start = denormKeypoints[i];
      const end   = denormKeypoints[j];
      if (start && end) {
        const startX = start[0] * safeWidth;
        const startY = start[1] * safeHeight;
        const endX   = end[0]   * safeWidth;
        const endY   = end[1]   * safeHeight;

        canvasContext.moveTo(startX, startY);
        canvasContext.lineTo(endX,   endY);
      }
    });
    canvasContext.stroke();

    // Draw keypoints
    const pointsToDraw = new Set();
    connections.forEach(([i, j]) => {
      pointsToDraw.add(i);
      pointsToDraw.add(j);
    });

    pointsToDraw.forEach(i => {
      const point = denormKeypoints[i];
      if (!point) return;

      const [nx, ny] = point;
      const x = nx * safeWidth;
      const y = ny * safeHeight;

      // fill and outline in orange
      canvasContext.fillStyle   = transitionStyle.pointColor;
      canvasContext.strokeStyle = transitionStyle.pointOutline;
      canvasContext.lineWidth   = transitionStyle.pointOutlineWidth;

      canvasContext.beginPath();
      canvasContext.arc(x, y, transitionStyle.pointRadius, 0, 2 * Math.PI);
      canvasContext.fill();
      canvasContext.stroke();
    });

    // Reset dash
    canvasContext.setLineDash([]);
    canvasContext.restore();
  }


  function renderFrame() {
    if (!webcam || !canvasCtx || webcam.readyState !== 4 || !isInitialized) {
      if (canvasCtx) canvasCtx.clearRect(0, 0, output_canvas.width, output_canvas.height);
      if (canvasContext) canvasContext.clearRect(0, 0, safeWidth, safeHeight);
      animationFrame = requestAnimationFrame(renderFrame);
      return;
    }

    const containerWidth = output_canvas.width;
    const containerHeight = output_canvas.height;
    const videoWidth = webcam.videoWidth;
    const videoHeight = webcam.videoHeight;

    const videoRatio = videoWidth / videoHeight;
    const containerRatio = containerWidth / containerHeight;

    let drawWidth, drawHeight, offsetX = 0, offsetY = 0;

    if (containerRatio < 1) {
      drawHeight = containerHeight;
      drawWidth = containerHeight * videoRatio;
      offsetX = (containerWidth - drawWidth) / 2;
      offsetY = 0;
    } else {
      drawWidth = containerWidth;
      drawHeight = containerWidth / videoRatio;
      offsetY = (containerHeight - drawHeight) / 2;
    }

    canvasCtx.clearRect(0, 0, containerWidth, containerHeight);

    canvasCtx.save();
    canvasCtx.scale(-1, 1);
    canvasCtx.translate(-containerWidth, 0);
    canvasCtx.drawImage(webcam, offsetX, offsetY, drawWidth, drawHeight);
    canvasCtx.restore();

    if (!userInPosition) {
      drawTargetBox();
    }

    if (!analysisPaused && detectPoseActive && poseLandmarker && drawingUtils) {
      const timestamp = performance.now();
      try {
        const results = poseLandmarker.detectForVideo(webcam, timestamp);

        if (results?.landmarks?.length > 0) {
          for (const landmarks of results.landmarks) {
            const scaledLandmarks = landmarks.map(landmark => ({
              x: offsetX + landmark.x * drawWidth,
              y: offsetY + landmark.y * drawHeight,
              z: landmark.z,
              visibility: landmark.visibility
            }));

            checkUserPosition(scaledLandmarks);

            canvasCtx.save();
            canvasCtx.scale(-1, 1);
            canvasCtx.translate(-containerWidth, 0);

            drawingUtils.drawConnectors(scaledLandmarks, PoseLandmarker.POSE_CONNECTIONS, {
              color: userInPosition ? '#00FF00' : '#FF0000',
              lineWidth: 4
            });

            drawingUtils.drawLandmarks(scaledLandmarks, {
              color: '#FFFF00',
              lineWidth: 8,
              radius: 6
            });

            const keyIndices = [11, 12, 23, 24, 25, 26, 27, 28, 15, 16, 13, 14];
            const keyLandmarks = keyIndices.map(i => scaledLandmarks[i]);
            
            canvasCtx.fillStyle = 'white';
            keyLandmarks.forEach(({x, y}) => {
              canvasCtx.beginPath();
              canvasCtx.arc(x, y, 6, 0, 2 * Math.PI);
              canvasCtx.fill();
            });

            const boneConnections = [
              [11, 12], [11, 23], [12, 24], [23, 24],
              [24, 26], [26, 28], [23, 25], [25, 27],
              [12, 14], [14, 16], [11, 13], [13, 15]
            ];

            canvasCtx.strokeStyle = 'white';
            canvasCtx.lineWidth = 2;
            canvasCtx.setLineDash([8, 4]);
            canvasCtx.beginPath();
            
            boneConnections.forEach(([i, j]) => {
              const a = scaledLandmarks[i];
              const b = scaledLandmarks[j];
              canvasCtx.moveTo(a.x, a.y);
              canvasCtx.lineTo(b.x, b.y);
            });
            
            canvasCtx.stroke();
            canvasCtx.setLineDash([]);
            canvasCtx.restore();

            if (userInPosition && controller && controllerInitialized) {
              operationId++;
              const transformedResults = {
                poseLandmarks: landmarks
              };
              controller.updateFrame(transformedResults);
              currentTime += 1 / 60;
              const [currentPhase, exerciseName, repCount, targetReps] = controller.processExercise(currentTime);
              
              currentReps = repCount;
              currentScore = controller.score;
              yogName = exerciseName;
              currentExerciseName = exerciseName;
              
              if (!exerciseStats[currentExerciseName]) {
                exerciseStats[currentExerciseName] = {
                  rep_done: 0,
                  score: 0,
                  timestamp: new Date().toISOString()
                };
              }

              exerciseStats[currentExerciseName].rep_done = currentReps;
              exerciseStats[currentExerciseName].score = currentScore;

              if (currentPhase && currentPhase !== lastPhase) {
                lastPhase = currentPhase;
                showPhase = true;
                if (phaseTimeout) clearTimeout(phaseTimeout);
                phaseTimeout = setTimeout(() => {
                  showPhase = false;
                }, 3000);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error detecting pose:', error);
      }
    }
    
    if (currentReps !== undefined) {
      const cw = canvasCtx.canvas.width;
      const ch = canvasCtx.canvas.height;
      canvasCtx.save();
      canvasCtx.fillStyle = 'yellow';
      canvasCtx.font = '30px Arial';
      canvasCtx.textAlign = 'center';
      canvasCtx.textBaseline = 'middle';
      // canvasCtx.fillText(`Reps: ${currentReps}`, cw/2, ch/2 - 20);
      canvasCtx.restore();
    }
    animationFrame = requestAnimationFrame(renderFrame);
  }

  function drawTargetBox() {
    if (!canvasCtx) return;

    canvasCtx.save();
    canvasCtx.fillStyle = 'rgba(255, 0, 0, 0)';
    canvasCtx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
    canvasCtx.lineWidth = 2;
    canvasCtx.fillRect(targetBox.x, targetBox.y, targetBox.width, targetBox.height);
    canvasCtx.strokeRect(targetBox.x, targetBox.y, targetBox.width, targetBox.height);

    canvasCtx.fillStyle = 'white';
    canvasCtx.font = '20px Arial';
    canvasCtx.textAlign = 'center';
    canvasCtx.restore();
  }

  function checkUserPosition(landmarks) {
    if (!isInitialized) return;
    if (!landmarks || landmarks.length === 0){
      canvasContext.clearRect(0, 0, canvasContext?.canvas.width, canvasContext?.canvas.height);
      return;
    }
    const keyLandmarks = [
      landmarks[0], // nose
      landmarks[11], // left shoulder
      landmarks[12], // right shoulder
      landmarks[23], // left hip
      landmarks[24], // right hip
      landmarks[27], // left ankle
      landmarks[28], // right ankle
      landmarks[15], // left wrist
      landmarks[16] // right wrist
    ];

    let pointsInBox = 0;
    const totalPoints = keyLandmarks.length;

    keyLandmarks.forEach(point => {
      if (
        point &&
        point.x >= targetBox.x &&
        point.x <= targetBox.x + targetBox.width &&
        point.y >= targetBox.y &&
        point.y <= targetBox.y + targetBox.height
      ) {
        pointsInBox++;
      }
    });

    if (pointsInBox === totalPoints && !userInPosition) {
      userInPosition = true;
      if (status === 'stopped') {
        handlePlay();
      }
    } else if (pointsInBox < totalPoints && userInPosition) {
      canvasContext.clearRect(0, 0, canvasContext.canvas.width, canvasContext.canvas.height);
      userInPosition = false;
    }
  }

  function handleResize() {
    if (webcam && webcam.videoWidth && containerElement && output_canvas) {
      output_canvas.width = containerElement.clientWidth;
      output_canvas.height = containerElement.clientHeight;
      output_canvas.style.width = `${containerElement.clientWidth}px`;
      output_canvas.style.height = `${containerElement.clientHeight}px`;
      
      if (canvasCtx) {
        drawingUtils = new DrawingUtils(canvasCtx);
      }
      setupTargetBox();
    }

    safeWidth = window.innerWidth;
    safeHeight = window.innerHeight;
    const overlayCanvas = document.getElementById('overlayCanvas') as HTMLCanvasElement | null;
    if (overlayCanvas) {
      overlayCanvas.width = safeWidth;
      overlayCanvas.height = safeHeight;
    }
  }

  function handlePlay() {
    status = 'playing';
    sessionStartTime = Date.now();
    progressInterval = setInterval(updateProgress, 100);
    detectPoseActive = true;

    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }
    renderFrame();
  }

  function handlePause() {
    if (status === 'playing') {
      status = 'paused';
      pauseStartTime = Date.now();
      if (progressInterval) clearInterval(progressInterval);
    } else if (status === 'paused') {
      status = 'playing';
      if (pauseStartTime) {
        totalPausedTime += Date.now() - pauseStartTime;
        pauseStartTime = null;
      }
      progressInterval = setInterval(updateProgress, 100);
    }
  }

  function handleStop() {
    showModal = true;
  }

  async function confirmStop() {
status = 'stopped';
if (progressInterval) clearInterval(progressInterval);

const workoutSummary = {
  yoga_name: yogName,
  reps: currentReps,
  score: currentScore,
  time: elapsedMs,
  exercises: exerciseStats,
  summaryJson: jsonDump
};

// Store in localStorage
const draftWorkout = {
  title: `${yogName} Workout Summary`,
  description: `Completed ${currentReps} reps with score ${currentScore}`,
  yoga_name: yogName,
  reps: currentReps,
  score: currentScore,
  time: elapsedMs,
  summaryJson: workoutSummary
};

localStorage.setItem('workoutDraft', JSON.stringify(draftWorkout));

// Redirect to sharing page
goto('/yoga/share-workout');

showModal = false;
}

  function cancelStop() {
    showModal = false;
  }

  function updateProgress() {
    if (status !== 'playing' || !sessionStartTime) return;
    const now = Date.now();
    elapsedMs = now - sessionStartTime - totalPausedTime;
    progressValue = Math.min((elapsedMs / 300000) * 100, 100);
    if (progressValue >= 100) handleStop();
  }

  function handleBack() {
    goto('/home');
  }

  function handleVideoButtonClick() {
    showInstructionalModal = true;
  }

  function closeInstructionalModal() {
    showInstructionalModal = false;
  }

  // Component Logic
  $: currentWorkout = $allWorkouts.find(workout => workout.title === yogName) || $allWorkouts[0] || null;
  $: drawerTranslation = drawerState === 'partial' ? '94%' : '0%';
  $: p = parseFloat(drawerTranslation.replace('%', ''));
  $: visibleHeightPercentage = 90 * (1 - p / 100);

  workoutStore.subscribe((workouts) => {
    workoutJson = workouts?.data[0].attributes.excercise?.data.attributes?.json;
  });

  onMount(() => {
    if (!browser) return;
    
    const canvas = document.getElementById('overlayCanvas') as HTMLCanvasElement | null;
    if (canvas) {
      canvasContext = canvas.getContext('2d');
      handleResize();
    }
    
    let unsubscribe: () => void;

    (async () => {
      let titlesToFetch:string[] = [];
      unsubscribe = workoutDetails.subscribe((data) => {
        if (data?.exercises) {
          titlesToFetch = data.exercises.data.map((ex) => ex.attributes.title.trim());
        }
      });

      let fetchedCount = 0;
      let totalCount = 0;
      exerciseData = await fetchAltExercises(titlesToFetch, (count, total) => {
        loadingProgress = count;
        loadingTotal = total;
        showProgressBar = true
        fetchedCount = count;
        totalCount = total;
        if (count === total) {
          setTimeout(() => showProgressBar = false, 500);
        }
      });
      
      filteredExercises = exerciseData;
      webcam = document.getElementById('webcam') as HTMLVideoElement;
      output_canvas = document.getElementById('output_canvas') as HTMLCanvasElement;
      canvasCtx = output_canvas.getContext('2d')!;
      containerElement = document.getElementById('webcam-container') as HTMLDivElement;

      output_canvas.width = containerElement.clientWidth;
      output_canvas.height = containerElement.clientHeight;
      output_canvas.style.width = `${containerElement.clientWidth}px`;
      output_canvas.style.height = `${containerElement.clientHeight}px`;

      try {
        const exercisePlan = filteredExercises.reduce((plan, { name, reps, altData }) => {
          plan[name] = {
            json_data: altData,
            reps
          };
          return plan;
        }, {});

        controller = new Controller(exercisePlan);
        await controller.initialize();
        controller.startExerciseSequence();
        controllerInitialized = true;
        yogName = controller.getExcerciseName();
        dimensions = `Camera active, Controller: ${controller.currentExercise}`;
      } catch (error) {
        console.error('Controller initialization failed:', error);
        dimensions = `Controller error: ${error.message}`;
      }

      await initPoseLandmarker();
      await startCamera();
      isInitialized = true;

      window.addEventListener('resize', handleResize);
      window.addEventListener('orientationchange', () => {
        setTimeout(handleResize, 500);
      });
    })();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  });

  jsonDump = JSON.stringify(exerciseStats, null, 2);

  onDestroy(() => {
    if (!browser) return;
    if (transitionTimeout) clearTimeout(transitionTimeout);
    if (animationFrame) cancelAnimationFrame(animationFrame);
    if (stream) stream.getTracks().forEach(track => track.stop());
    if (progressInterval) clearInterval(progressInterval);
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('orientationchange', handleResize);
    if (phaseTimeout) clearTimeout(phaseTimeout);
  });
</script>

<div class="h-surface flex flex-col overflow-hidden relative w-full">
  {#if showTransitionLoading}
  <div class="fixed inset-0 flex items-center justify-center z-[9998] bg-black bg-opacity-70">
    <div class="bg-white rounded-xl p-8 max-w-md w-full mx-4 text-center animate-fade-in">
      <div class="animate-pulse mb-6">
        <svg class="w-16 h-16 mx-auto text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
        </svg>
      </div>
      <h3 class="text-xl font-medium mb-2">Preparing Next Exercise</h3>
      <h2 class="text-3xl font-bold text-primary mb-6">{nextExerciseTitle}</h2>
      <div class="w-full bg-gray-200 rounded-full h-2">
        <div class="bg-primary h-2 rounded-full transition-all duration-300" 
             style={`width: ${(elapsedMs % TRANSITION_DURATION) / TRANSITION_DURATION * 100}%`}>
        </div>
      </div>
    </div>
  </div>
  {/if}

  {#if showProgressBar}
  <div class="fixed top-0 inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg p-6 w-80 shadow-xl">
      <div class="flex items-center justify-center mb-4">
        <svg class="animate-spin h-8 w-8 text-primary" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
      <div class="text-center mb-2 font-medium text-gray-700">
        Loading Exercises...
      </div>
      <div class="w-full bg-gray-200 rounded-full h-2.5">
        <div 
          class="bg-primary h-2.5 rounded-full transition-all duration-300" 
          style={`width: ${(loadingProgress / loadingTotal) * 100}%`}
        ></div>
      </div>
      <div class="flex justify-between mt-2 text-sm text-gray-600">
        <span>{loadingProgress}/{loadingTotal} loaded</span>
        <span>{Math.round((loadingProgress / loadingTotal) * 100)}%</span>
      </div>
    </div>
  </div>
  {/if}

  <div id="webcam-container" style="background: black;" class="relative bg-black overflow-hidden" bind:this={containerElement}>
    <video id="webcam" autoplay playsinline muted style="display: none;"></video>
    <canvas id="output_canvas" class="pointer-events-none absolute top-0 left-0 z-0 w-full h-full"></canvas>
    <canvas id="overlayCanvas" class="pointer-events-none absolute top-0 left-0 z-10 w-full h-full"></canvas>
    
    {#if dimensions === 'Waiting for camera...' }
      <div class="loading-container">
        <div class="loading-text">Get ready...</div>
        <div class="loading-bar">
          <div class="loading-bar-fill"></div>
        </div>
      </div>
    {/if}

    {#if !userInPosition && !dimensions.startsWith('Camera error') && !dimensions.startsWith('Pose landmarker error')}
    <div
      class="absolute left-1/2 transform -translate-x-1/2 z-20 flex justify-between items-center w-full px-4"
      style="bottom: 5%; 
           max-width: {isInitialized ? targetBox.width : '90%'};"
    >
      <button on:click={handleVideoButtonClick} class="h-16 w-16 rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary">
        <img
          src={currentWorkout?.src || 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b'}
          alt="Media button"
          class="h-full w-full object-cover"
        />
      </button>

      <button on:click={handlePlay} class="bg-white p-4 rounded-full relative shadow-lg focus:outline-none hover:bg-gray-100">
        <svg class="w-10 h-10 text-black" viewBox="0 0 24 24">
          <path d="M10 8l6 4-6 4V8z" fill="currentColor" />
        </svg>
      </button>
      <button on:click={handleStop} class="bg-white p-4 rounded-full shadow-lg focus:outline-none hover:bg-gray-100">
        <img src={stop} alt="stop" class="w-6 h-6 z-10">
      </button>
    </div>
    {/if}

    {#if userInPosition}
      <div class="user-in-position-container">
        <div class="score-reps-container">
          <div class="flex items-center px-4 py-3 rounded-lg border-2 border-orange-500 bg-white bg-opacity-80">
            <div class="flex flex-col mr-8">
              <div class="text-3xl"><img src={target} alt="Target" /></div>
              <div class="text-xl text-gray-800">Reps</div>
            </div>
            <div class="text-5xl ml-4 text-gray-800">{currentReps}</div>
          </div>
          <div class="flex items-center border-2 border-orange-400 px-2 py-1 rounded-lg bg-white bg-opacity-80">
            <div class="flex flex-col mr-8">
              <div class="text-3xl"><img src={award} alt="Award" /></div>
              <div class="text-xl text-gray-800">Score</div>
            </div>
            <div class="text-5xl ml-2 text-gray-800">{currentScore}</div>
          </div>
        </div>

        <div class="progress-container bg-gray-100">
          <div class="yoga-name">{yogName}</div>
          <div class="custom-progress-bar">
            <div class="progress-bg">
              <div class="progress-fill" style="width: {progressValue}%" />
            </div>
          </div>
        </div>
      </div>
    {/if}

    {#if showPhase && currentPhase}
      <div class="phase-display">
        {currentPhase}
      </div>
    {/if}
  </div>
  
  <div style="height: {visibleHeightPercentage}%; transition: height 300ms;"></div>

  <div
    class="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl transition-transform duration-300 w-full border-t-1 border-b flex flex-col z-30"
    style="transform: translateY({drawerTranslation}); height: 90%;"
  >
    <div class="w-full h-8 flex justify-center items-center cursor-pointer" on:click={handleDrawerToggle}>
      <div class="w-32 h-1 bg-gray-700 rounded-full"></div>
    </div>

    {#if drawerState === 'full'}
      <div class="flex flex-col flex-grow overflow-hidden items-center z-60">
        <h2 class="text-xl  mb-4 mt-2 font-sans border-b-2  w-[90vw] border-gray-200 py-2">
          {$allWorkouts.length} Asanas Remaining
        </h2>
        <div class=" flex-grow overflow-y-auto">
          {#each $allWorkouts as workout}
            <div class="flex  space-x-4 p-2 px-4 rounded-lg items-center min-w-[100vw]" >
              <img src={workout.src} alt={workout.title} class="w-28 h-28 object-cover rounded-md" />
              <div class="flex-grow">
                <h3 class="text-md font-medium">{workout.description}</h3>
                <div class="flex flex-col text-gray-600">
                  <span class="text-md mt-1 mb-3">{workout.extraData?.reps || 3} reps</span>
                  <span class="text-md">{workout.extraData?.duration || '20 min'}</span>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  {#if showModal}
    <div class="fixed inset-0 flex items-center justify-center z-50">
      <div class="bg-white p-6 rounded-lg shadow-lg">
        <h2 class="text-xl font-bold mb-4">Confirm Stop</h2>
        <p class="mb-4">Do you want to finish the exercise?</p>
        <div class="flex justify-end space-x-4">
          <button on:click={cancelStop} class="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
          <button on:click={confirmStop} class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">Yes</button>
        </div>
      </div>
    </div>
  {/if}

  {#if showInstructionalModal}
    <div class="fixed inset-0 flex items-center justify-center z-50 p-2 mb-8">
      <div class="bg-white p-6 shadow-lg w-[96vw] h-[92vh] overflow-hidden instructional-modal flex flex-col">
        <div class="flex-grow overflow-y-auto hide-scrollbar">
          <video
            src={currentWorkout?.videoUrl || 'https://example.com/anuvittasana-instructional-video.mp4'}
            controls
            autoplay
            class="w-full h-48 rounded-lg mb-8 border-2 border-orange-500"
          ></video>
          <div class="w-full flex flex-row justify-between mb-6 items-center">
            <h2 class="text-2xl mb-4">{currentWorkout?.title || yogName}</h2>
            <div>
              <div class="text-gray-600">{currentWorkout?.extraData?.reps || 3} reps</div>
              <div class="text-gray-600">{currentWorkout?.extraData?.duration || '20 min'}</div>
            </div>
          </div>

          <div class="w-full pb-20 font-sans">
            <div class="text-gray-800">
              {#if currentWorkout?.extraData}
                {#each currentWorkout.extraData.sections as section}
                  <h3 class="text-2xl mb-2">{section.section_title}:</h3>
                  <ol class="list-decimal pl-5 mb-6 text-2xl ">
                    {#each section.items as item}
                      <li >{item}</li>
                    {/each}
                  </ol>
                {/each}
              {:else}
                <h3 class="text-lg font-semibold mb-2">Instructions:</h3>
                <p>No detailed instructions available for {currentWorkout?.title || yogName}.</p>
              {/if}
            </div>
          </div>
        </div>

        <div class="fixed bottom-4 left-0 right-0 flex justify-between items-center px-4 py-2 bg-gray-500">
          <button on:click={handleVideoButtonClick} class="h-16 w-16 overflow-hidden focus:outline-none bg-white shadow-xl hover:bg-gray-100 rounded-full">
            <img
              src={nexticon}
              alt="Next button"
              class="h-full w-full object-cover rounded-full"
            />
          </button>

          <button on:click={closeInstructionalModal} class="bg-white p-4 rounded-full shadow-xl focus:outline-none hover:bg-gray-100">
            <svg class="w-10 h-10 text-black" viewBox="0 0 24 24">
              <path d="M10 8l6 4-6 4V8z" fill="currentColor" />
            </svg>
          </button>
          <button on:click={handleStop} class="bg-white p-4 rounded-full shadow-xl focus:outline-none hover:bg-gray-100">
            <img src={stop} alt="" class="w-6 h-6">
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  :global(body) {
    overflow: hidden;
    background-color: #000;
    height: 100vh;
    width: 100vw;
    margin: 0;
  }

  canvas {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
  }
 
  .animate-fade-in {
    animation: fadeIn 0.3s ease-out;
  }
  .animate-pulse {
    animation: pulse 1.5s infinite;
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }

  .hide-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .hide-scrollbar::-webkit-scrollbar {
    display: none;
  }

  .h-surface {
    height: 100vh;
    width: 100vw;
  }

  #webcam-container {
    width: 100vw;
    height: 100vh;
    position: relative;
    overflow: hidden;
    background-color: #000;
  }

  #output_canvas {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
  }

  .user-in-position-container {
    position: absolute;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    pointer-events: none;
  }

  .user-in-position-container > * {
    pointer-events: auto;
  }

  .score-reps-container {
    width: 100%;
    padding: 16px;
    display: flex;
    justify-content: space-between;
  }

  .anuvittasana-text {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    color: white;
    font-size: 20px;
    text-align: center;
    background-color: rgba(77, 74, 74, 0.5);
    padding: 4px 2px;
    border-radius: 8px;
    width: 100vw;
  }

  .suggestion-text {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    font-size: 15px;
    text-align: center;
    background-color: rgba(233, 229, 229, 0.8);
    padding: 4px 2px;
    border-radius: 4px;
    width: 95vw;
    font-family: sans-serif;
    color: rgb(69, 69, 69);
  }

  .progress-container {
    width: 100%;
    padding: 16px;
    background-color: rgba(40, 39, 39, 0.5);
  }

  .yoga-name {
    font-size: 20px;
    font-weight: bold;
    color: #f3ecec;
    text-align: center;
    margin-bottom: 8px;
  }

  .custom-progress-bar {
    width: 100%;
    background-color: #fff;
    border-radius: 16px;
    overflow: hidden;
    height: 20px;
    position: relative;
    border: 1px solid #ccc;
  }

  .progress-bg {
    width: 100%;
    height: 100%;
    background-color: #fff;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background-color: #32cd32;
    transition: width 0.3s ease-in-out;
  }

  .loading-container {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    z-index: 20;
  }

  .loading-text {
    color: white;
    font-size: 24px;
    font-weight: bold;
    margin-bottom: 16px;
    text-align: center;
  }

  .loading-bar {
    width: 200px;
    height: 20px;
    background-color: rgba(255, 255, 255, 0.2);
    border-radius: 10px;
    overflow: hidden;
  }

  .loading-bar-fill {
    width: 0;
    height: 100%;
    background-color: #32cd32;
    animation: loading 2s infinite ease-in-out;
  }

  @keyframes loading {
    0% {
      width: 0;
    }
    50% {
      width: 100%;
    }
    100% {
      width: 0;
    }
  }

  .fixed {
    position: fixed;
  }

  .inset-0 {
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
  }

  .z-50 {
    z-index: 50;
  }

  .flex {
    display: flex;
  }

  .items-center {
    align-items: center;
  }

  .justify-center {
    justify-content: center;
  }

  .bg-black {
    background-color: #000;
  }

  .bg-opacity-50 {
    opacity: 0.5;
  }

  .bg-white {
    background-color: #fff;
  }

  .p-6 {
    padding: 1.5rem;
  }

  .rounded-lg {
    border-radius: 0.5rem;
  }

  .shadow-lg {
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  }

  .text-xl {
    font-size: 1.25rem;
  }

  .font-bold {
    font-weight: 700;
  }

  .mb-4 {
    margin-bottom: 1rem;
  }

  .justify-end {
    justify-content: flex-end;
  }

  .space-x-4 > :not([hidden]) ~ :not([hidden]) {
    margin-left: 1rem;
  }

  .px-4 {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .py-2 {
    padding-top: 0.5rem;
    padding-bottom: 0.5rem;
  }

  .bg-gray-300 {
    background-color: #d1d5db;
  }

  .hover\:bg-gray-400:hover {
    background-color: #9ca3af;
  }

  .bg-red-500 {
    background-color: #ef4444;
  }

  .text-white {
    color: #fff;
  }

  .hover\:bg-red-600:hover {
    background-color: #dc2626;
  }

  .rounded {
    border-radius: 0.25rem;
  }

  .phase-display {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background-color: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 16px 32px;
    border-radius: 8px;
    font-size: 24px;
    font-weight: bold;
    text-transform: capitalize;
    z-index: 20;
    pointer-events: none;
  }

  .instructional-modal {
    position: relative;
    bottom: 0;
    left: 0;
    right: 0;
    background-color: white;
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;
    padding: 16px;
    max-width: 100%;
    max-height: 100vh;
    overflow-y: auto;
    z-index: 60;
    box-shadow: 0 -4px 8px rgba(0, 0, 0, 0.1);
    transform: translateY(100%);
    animation: slideUp 0.3s ease-out forwards;
  }

  @keyframes slideUp {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  .instructional-modal video {
    width: 100%;
    max-height: 200px;
    border-radius: 8px;
    margin-bottom: 16px;
  }

  .instructional-modal h2 {
    font-size: 20px;
    font-weight: bold;
    text-align: center;
    margin-bottom: 16px;
  }

  .instructional-modal h3 {
    font-size: 16px;
    font-weight: 500;
    margin-top: 12px;
    margin-bottom: 8px;
  }

  .instructional-modal p,
  .instructional-modal li {
    font-size: 16px;
    font-weight: 400;
    color: #333;
    line-height: 1.5;
  }
</style>
