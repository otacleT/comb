Implement change "{{change}}" by working through {{tasksPath}} in order. Write the code, tests and docs the tasks call for in the repository; any Comb file you touch stays in {{language}}.

1. Read context.readFiles: the proposal, the delta(s) (the requirements to implement), the tasks, this change's questions and decisions, and the current specs the delta changes.
2. If context.openQuestions has a high-severity question, stop before writing code: name each one and let the user choose between resolving it first (/comb:clarify) and proceeding anyway.
3. Work through the tasks in order. When a task is done, including its tests, change its "- [ ]" to "- [x]" in {{tasksPath}}. Never tick a task you did not finish.
4. Implement what the delta says. When the code needs behavior the delta does not specify, or contradicts it, stop and tell the user: the gap becomes a question for /comb:review or /comb:clarify, not a silent choice in code.
5. Never edit the delta, comb/specs/ or comb/decisions.md while implementing.
6. When every task is ticked, run `comb status --change {{change}}` and suggest /comb:archive.
