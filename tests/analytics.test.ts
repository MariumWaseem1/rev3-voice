import {describe,it,expect,vi,afterEach} from 'vitest';
import {analyticsEvent,captureStudioEvent} from '../src/lib/analytics';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('PostHog data minimisation',()=>{
 it('sends only a pseudonymous identifier and fixed metadata',async()=>{
 vi.stubEnv('POSTHOG_PROJECT_TOKEN','test-token');vi.stubEnv('POSTHOG_HOST','https://eu.i.posthog.com');
 const send=vi.fn().mockResolvedValue(new Response('{}',{status:200}));vi.stubGlobal('fetch',send);
 expect(await captureStudioEvent('studio_setup_saved','private-user-id')).toBe(true);
 const body=JSON.parse(send.mock.calls[0][1].body);expect(body.properties.distinct_id).not.toBe('private-user-id');
 expect(Object.keys(body.properties).sort()).toEqual(['$geoip_disable','$process_person_profile','distinct_id','environment','source'].sort());
 expect(analyticsEvent('admin/conversation')).toBeUndefined();
 });
 it('stays disabled without configuration and tolerates provider failure',async()=>{
 vi.stubEnv('POSTHOG_PROJECT_TOKEN','');const send=vi.fn();vi.stubGlobal('fetch',send);expect(await captureStudioEvent('test','id')).toBe(false);expect(send).not.toHaveBeenCalled();
 vi.stubEnv('POSTHOG_PROJECT_TOKEN','test-token');vi.stubEnv('POSTHOG_HOST','https://eu.i.posthog.com');send.mockRejectedValue(Error('offline'));expect(await captureStudioEvent('test','id')).toBe(false);
 });
});
