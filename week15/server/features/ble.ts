import NodeBle, { createBluetooth } from "node-ble";
import { BehaviorSubject, concatMap, Subject, Subscription } from "rxjs";

export const opMac = "B0:81:84:04:70:E2";
export const swMac = "B0:81:84:04:59:DE";
export const uartServiceUuid = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
export const commonTxCharacteristicId = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
export const commonRxCharacteristicId = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";

const { bluetooth, destroy } = createBluetooth();

export class BLEDevice {
  private mac: string;

  constructor(mac: string) {
    this.mac = mac;
  }

  device$ = new BehaviorSubject<NodeBle.Device | null>(null);

  private internalMessage$ = new Subject<string>();
  private rxCharacteristic: NodeBle.GattCharacteristic | null = null;
  private txCharacteristic: NodeBle.GattCharacteristic | null = null;

  private sendQueue$ = new Subject<string>();
  private sendQueueSub: Subscription | null = null;

  message$ = this.internalMessage$.asObservable();

  async connect() {
    if (this.rxCharacteristic) {
      this.rxCharacteristic.removeAllListeners("valuechanged");
      this.rxCharacteristic = null;
    }
    this.txCharacteristic = null;

    const adapter = await bluetooth.defaultAdapter();
    if (!(await adapter.isDiscovering())) await adapter.startDiscovery();
    console.log(`[BLE] starting adapter ${await adapter.getName()}`);
    const device = await adapter.waitDevice(this.mac);
    console.log(`[BLE] connecting ${await device.getName()}`);
    await device.connect();
    console.log(`[BLE] connected ${await device.getName()}`);

    const gattServer = await device.gatt();
    const urtService = await gattServer.getPrimaryService(uartServiceUuid);

    this.rxCharacteristic = await urtService.getCharacteristic(commonTxCharacteristicId).catch(() => {
      console.log(`[BLE] RX characteristic not found for ${this.mac}`);
      return null;
    });
    this.txCharacteristic = await urtService.getCharacteristic(commonRxCharacteristicId).catch(() => {
      console.log(`[BLE] TX characteristic not found for ${this.mac}`);
      return null;
    });

    this.rxCharacteristic?.on("valuechanged", (data: Buffer) => {
      const message = data.toString("utf-8");
      this.internalMessage$.next(message);
    });
    await this.rxCharacteristic?.startNotifications();

    this.device$.next(device);

    const disconnectHandler = () => {
      console.log(`[BLE] disconnected ${this.mac}`);
      this.device$.next(null);
      this.rxCharacteristic?.removeAllListeners("valuechanged");
      this.rxCharacteristic = null;
      this.txCharacteristic = null;
      device.removeListener("disconnect", disconnectHandler);
    };

    device.on("disconnect", disconnectHandler);

    this.sendQueueSub = this.sendQueue$
      .pipe(concatMap(async (message) => this.txCharacteristic?.writeValue(Buffer.from(message, "utf-8"))))
      .subscribe();

    return this;
  }

  async disconnect() {
    this.sendQueueSub?.unsubscribe();
    this.sendQueueSub = null;
    await this.device$.getValue()?.disconnect();
  }

  async send(message: string) {
    console.log(`[BLE] sending to ${this.mac}:`, message);
    this.sendQueue$.next(message);
  }
}
