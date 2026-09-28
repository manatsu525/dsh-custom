export const name = "vps-owns-host";
export const inject = ["webServer"];

export function apply(ctx) {
  ctx.on("webserver/index-inject", (table) => {
    table.push({
      kind: "script",
      placement: "head",
      text: "globalThis.__DSH_TRANSPORT__=Object.assign({},globalThis.__DSH_TRANSPORT__,{ownsHost:true});",
    });
  });
}
