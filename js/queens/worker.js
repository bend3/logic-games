import { generateForDifficulty } from './logic.js';

self.onmessage = ({ data: { n, difficulty } }) => {
  self.postMessage(generateForDifficulty(n, difficulty));
};
