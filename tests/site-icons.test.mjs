import test from 'node:test';
import assert from 'node:assert/strict';
import {renderIcon} from '../site-icons.mjs';
import {FiSearch} from 'react-icons/fi';

test('icons render as accessible static SVG markup',()=>{
  const markup=renderIcon(FiSearch,{className:'site-icon'});

  assert.match(markup,/<svg/);
  assert.match(markup,/aria-hidden="true"/);
  assert.match(markup,/focusable="false"/);
  assert.match(markup,/class="site-icon/);
});
