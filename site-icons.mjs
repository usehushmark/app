import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

export function renderIcon(Icon,props={}){
  return renderToStaticMarkup(React.createElement(Icon,{
    ...props,
    'aria-hidden':'true',
    focusable:'false'
  }));
}
