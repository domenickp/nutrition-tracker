// config/*.yaml is turned into plain data by the Vite plugin in build/yamlRoutinePlugin.ts.
declare module '*.yaml' {
  const routine: import('./lib/routine').Routine;
  export default routine;
}
