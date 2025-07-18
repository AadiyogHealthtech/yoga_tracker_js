// controller/yoga.js
console.log('Loading yoga.js');

import { detectFacing } from '../utils/utils.js';




/**
 * YogaDataExtractor
 * Fetches a JSON file containing keypoint frames and segment definitions,
 * and exposes methods to retrieve segments and ideal keypoints for analysis.
 */
export class YogaDataExtractor {
    /**
     * @param {string} jsonPath - URL or relative path to the exercise keypoints JSON
     */
    constructor(jsonPath) {
        console.log(`Creating YogaDataExtractor for ${jsonPath}`);
        this.data = null;
        this.keypointsData = null;
        this.segmentsData = null;
        this.jsonPath = jsonPath;
        this.loadPromise = this.loadData();
    }
    /**
     * loadData
     * Asynchronously fetches and parses the JSON file.
     * Populates this.data, this.keypointsData, and this.segmentsData,
     * or falls back to empty arrays on error.
     */
    async loadData() {
        try {
            console.log(`Fetching JSON from ${this.jsonPath}`);
            const response = await fetch(this.jsonPath);
            if (!response.ok) {
                throw new Error(`Failed to fetch ${this.jsonPath}: ${response.status}`);
            }
            const data = await response.json();
            console.log("Loaded JSON data:", data);
            this.data = data;
            this.keypointsData = data.frames || [];
            this.segmentsData = data.segments || [];
            console.log('Segments data:', this.segmentsData);
            console.log('Keypoints data length:', this.keypointsData.length);
        } catch (error) {
            console.error('Error loading JSON:', error);
            this.data = { frames: [], segments: [] };
            this.keypointsData = [];
            this.segmentsData = [];
        }
    }
    /**
     * ensureLoaded
     * Waits for the initial loadData() promise to complete,
     * then verifies that data is available, or resets to empty structures.
     */
    async ensureLoaded() {
        console.log('Ensuring JSON data is loaded');
        await this.loadPromise;
        if (!this.data || !this.segmentsData) {
            console.warn('Data not properly loaded after fetch');
            this.data = { frames: [], segments: [] };
            this.segmentsData = [];
            this.keypointsData = [];
        }
    }
    /**
     * segments
     * Converts raw segment definitions into enriched segment objects.
     * Each segment includes:
     *   - start: frame index where the segment begins
     *   - end: frame index where the segment ends
     *   - phase: descriptive name of the pose/phase
     *   - thresholds: numeric thresholds for pose comparison
     *   - facing: expected user orientation at the segment midpoint
     *   - type: segment category derived from phase string (e.g., "starting", "holding")
     *
     * @returns {Array<Object>} Array of segment metadata objects
     */
    segments() {
        console.log('Generating segments');
        if (!this.data || !this.segmentsData || !Array.isArray(this.segmentsData)) {
            console.warn('Segments data not available:', this.segmentsData);
            return [];
        }

        const segments = this.segmentsData.map(s => {
            try {
                // Extract the ideal keypoints for the segment frames
                const idealKeypoints = this.getIdealKeypoints(s[0], s[1]);
                const middleIdx = Math.floor(idealKeypoints.length / 2);
                // Determine the midpoint keypoint frame for facing detection
                    
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
                console.log(`Created segment: ${segment.phase}`);
                return segment;
            } catch (e) {
                console.error(`Invalid segment: ${s}`, e);
                return null;
            }
        }).filter(s => s !== null);
        console.log('Segments generated:', segments);
        return segments;
    }
    /**
     * getIdealKeypoints
     * Returns an array of numeric keypoint arrays between two frame indices.
     * Each frame in keypointsData is a list of comma-separated "x,y,z,..." strings.
     *
     * @param {number} startFrame - Index of the first frame (inclusive)
     * @param {number} endFrame - Index of the last frame (exclusive)
     * @returns {Array<Array<number>>} List of [x, y, z] coordinate arrays
     */

    getIdealKeypoints(startFrame, endFrame) {
        if (!this.keypointsData || !Array.isArray(this.keypointsData)) {
            console.warn('No keypoints data available');
            return [];
        }
        const subData = this.keypointsData.slice(startFrame, endFrame);
        return subData.map(frame => 
            frame.map(kp => {
                const [x, y, z] = kp.split(',').slice(0, 3).map(parseFloat);
                return [x || 0, y || 0, z || 0];
            })
        );
    }
}