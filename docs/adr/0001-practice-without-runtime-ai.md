# Practice runs without runtime AI

Adaptive practice must construct exercises, grade answers, and provide hints and explanations without runtime AI. Prepare reusable content and accepted answers in advance, and constrain exercises so they can be evaluated deterministically; arbitrary free-prose tasks are excluded rather than depending on an open-ended evaluator. The existing flash-reveal format may retain its explicit self-rating interaction without claiming independently verified correctness.

This decision covers practice. Removing AI from the rest of the application is a stated future intention, not part of this decision's immediate scope. Build-time content preparation is governed separately by the content pipeline requirements in [issue #11](https://github.com/Sevastian-Bahynskyi/ordly/issues/11).
