// Electron 안에서 serialport 네이티브 모듈이 로드되고 포트 목록을 읽는지 확인한다 (PoC 용, 포트는 열지 않는다)
const { app } = require("electron");
app.whenReady().then(async () => {
  try {
    const { SerialPort } = require("serialport");
    const list = await SerialPort.list();
    console.log("ELECTRON", process.versions.electron, "NODE", process.versions.node, "ABI", process.versions.modules);
    console.log("PORTS", list.map((p) => `${p.path}(${p.vendorId}:${p.productId})`).join(", "));
    app.exit(0);
  } catch (e) {
    console.error("FAIL", e.message);
    app.exit(1);
  }
});
