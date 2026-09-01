/**
 * Abstract base class for pipeline stages.
 * Each stage has a name, can emit progress, and has an execute() method.
 */
export class BasePipelineStage {
  constructor(name) {
    this.name = name;
    this.onProgress = null; // Set by orchestrator
  }

  emitProgress(percent, message) {
    if (this.onProgress) {
      this.onProgress(this.name, percent, message);
    }
  }

  /**
   * Execute this pipeline stage.
   * @param {object} context - shared pipeline context (mutated as pipeline progresses)
   * @returns {Promise<object>} - updated context
   */
  async execute(context) {
    throw new Error('execute() must be implemented by subclass');
  }
}
