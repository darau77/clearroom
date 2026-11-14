import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRoute,routeURL} from '../lib/navigation.ts';
test('every screen, draft, partner and reflection has a reloadable URL',()=>{for(const route of [{view:'home'},{view:'drills'},{view:'path'},{view:'progress'},{view:'settings'},{view:'guide'},{view:'browse'},{view:'practice',id:'draft-1'},{view:'review',id:'saved-1'},{view:'create-partner',id:'custom-1'},{view:'prepare',id:'custom-2',mode:'chat',lessonId:undefined}])assert.deepEqual(parseRoute(routeURL(route)),route);});
test('a conversation-path lesson survives refresh on its preparation screen',()=>{const route={view:'prepare',id:'deadlines',mode:'call',lessonId:'listen'};assert.deepEqual(parseRoute(routeURL(route)),route);});
