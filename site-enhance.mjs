import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {renderIcon} from './site-icons.mjs';
import {FiArrowDown,FiArrowLeft,FiArrowRight,FiArrowUpRight,FiCopy,FiInfo,FiPlus,FiSearch} from 'react-icons/fi';
import {SiX} from 'react-icons/si';
import {TokenSOL,TokenUSDC} from '@web3icons/react';

const icon=(Icon,className='site-icon',props={})=>renderIcon(Icon,{...props,className});
const arrowUp=icon(FiArrowUpRight);
const arrowRight=icon(FiArrowRight);
const arrowDown=icon(FiArrowDown);
const arrowLeft=icon(FiArrowLeft);
const info=icon(FiInfo);
const plus=icon(FiPlus);
const search=icon(FiSearch);
const tokenContractAddress='HUSHMARK_TOKEN_CA_PENDING';
const tokenContractCopy=`<div class="contract-address" data-contract-address="${tokenContractAddress}" data-copy-success="Preview CA copied" data-copy-error="Copy failed. Copy the preview CA manually."><span class="eyebrow">HUSHMARK TOKEN · NOT LIVE</span><div class="contract-address-value"><code>${tokenContractAddress}</code><button type="button" class="copy-contract" data-copy-contract aria-label="Copy preview token contract address">${icon(FiCopy)}</button></div><span class="copy-toast" data-copy-status role="status" aria-live="polite"></span></div>`;
const xLink=`<a class="social-link" href="https://x.com/devhushmark" target="_blank" rel="noopener noreferrer" aria-label="Hushmark on X">${icon(SiX)}</a>`;
const headerXLink=`<a class="social-link header-x-link" href="https://x.com/devhushmark" target="_blank" rel="noopener noreferrer" aria-label="Hushmark on X">${icon(SiX)}</a>`;
const solIcon=icon(TokenSOL,'token-icon',{size:18});
const usdcIcon=icon(TokenUSDC,'token-icon',{size:18});

function enhanceIcons(html){
  return html
    .replaceAll(' ↗',` ${arrowUp}`)
    .replaceAll(' →',` ${arrowRight}`)
    .replaceAll(' ←',` ${arrowLeft}`)
    .replaceAll(' ↓',` ${arrowDown}`)
    .replace('<span class="notice-icon">i</span>',`<span class="notice-icon">${info}</span>`)
    .replace('<summary>How private payments work <span aria-hidden="true">+</span></summary>',`<summary>How private payments work <span class="summary-icon" aria-hidden="true">${plus}</span></summary>`)
    .replace('</nav><a class="header-cta"',`</nav><div class="header-actions">${headerXLink}<a class="header-cta"`)
    .replace('</a></header>','</a></div></header>')
    .replace('<p>An open world deserves a private layer.</p>',`<p>An open world deserves a private layer.</p>${tokenContractCopy}${xLink}`)
    .replace('</head>','<link rel="stylesheet" href="/site-layout.css?v=20260925-3"><script src="/site.js" defer></script></head>');
}

function pageSearch(scope,label,links){
  return `<aside class="page-sidebar"><div class="sidebar-heading"><span class="eyebrow">ON THIS PAGE</span><span class="outline-tag">${label}</span></div><label class="page-search"><span aria-hidden="true">${search}</span><input type="search" data-search-input="${scope}" placeholder="Search ${scope}" aria-label="Search ${scope}"></label><nav class="page-nav" aria-label="${scope} sections">${links.map(([text,href])=>`<a href="${href}">${text}</a>`).join('')}</nav><p class="sidebar-hint">Search filters the content below without changing the original documentation.</p></aside>`;
}

function enhanceWallet(html){
  return html
    .replaceAll('<div class="asset-balance"><span>SOL</span>',`<div class="asset-balance"><span class="token-label">${solIcon}<span>SOL</span></span>`)
    .replaceAll('<div class="asset-balance"><span>USDC</span>',`<div class="asset-balance"><span class="token-label">${usdcIcon}<span>USDC</span></span>`)
    .replaceAll('<div class="asset-balance"><span>USDC · standard account</span>',`<div class="asset-balance"><span class="token-label">${usdcIcon}<span>USDC · standard account</span></span>`);
}
function addSearchScript(html){
  return html.replace('</head>','<script src="/site-search.js" defer></script></head>');
}

function enhanceDocs(html){
  const sidebar=pageSearch('docs','5 SECTIONS',[['Overview','#overview'],['Recovery','#recovery'],['Fees','#fees'],['Privacy limits','#limits'],['Token status','#token']]);
  return addSearchScript(html
    .replace('<div class="docs-content">',`<div class="page-shell docs-shell" data-search-scope="docs">${sidebar}<div class="docs-content">`)
    .replaceAll('<section id="','<section data-search-item="true" id="')
    .replace('<div class="reference-links">','<p class="search-empty" data-search-empty="docs" hidden>No documentation sections match your search.</p><div class="reference-links">')
    .replace('</div></main>','</div></div></main>'));
}

function enhanceRoadmap(html){
  const sidebar=pageSearch('roadmap','4 PHASES',[['Integrated','#milestone-1'],['Required','#milestone-2'],['Planned','#milestone-3'],['Later','#milestone-4']]);
  return addSearchScript(html
    .replace('<div class="roadmap-list">',`<div class="page-shell roadmap-shell" data-search-scope="roadmap">${sidebar}<div class="roadmap-content"><div class="roadmap-list">`)
    .replaceAll('<article class="milestone">','<article class="milestone" data-search-item="true">')
    .replace('class="milestone-index">01','class="milestone-index" id="milestone-1">01')
    .replace('class="milestone-index">02','class="milestone-index" id="milestone-2">02')
    .replace('class="milestone-index">03','class="milestone-index" id="milestone-3">03')
    .replace('class="milestone-index">04','class="milestone-index" id="milestone-4">04')
    .replace('<div class="roadmap-list">',`<div class="roadmap-list"><p class="search-empty" data-search-empty="roadmap" hidden>No roadmap phases match your search.</p>`)
    .replace('</div></main>','</div></div></div></main>'));
}

export function enhanceHtml(html,route){
  const pageClass={home:'home-page',wallet:'wallet-page',docs:'docs-page',roadmap:'roadmap-page'}[route]||'home-page';
  const routed=html.replace('<div class="site-wrap">',`<div class="site-wrap ${pageClass}">`);
  const enhanced=enhanceIcons(routed);
  if(route==='wallet')return enhanceWallet(enhanced);
  if(route==='docs')return enhanceDocs(enhanced);
  if(route==='roadmap')return enhanceRoadmap(enhanced);
  return enhanced;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  for(const route of ['','wallet','docs','roadmap']){
    const file=`dist/${route?route+'/':''}index.html`;
    const html=await readFile(file,'utf8');
    await writeFile(file,enhanceHtml(html,route));
  }
}
