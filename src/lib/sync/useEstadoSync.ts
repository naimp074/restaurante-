import { useStore } from '../storeSync';
import { loadEstadoSync, syncEstadoEvent } from './estado';

export const useEstadoSync = () => useStore(syncEstadoEvent, loadEstadoSync);
