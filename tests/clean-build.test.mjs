import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

test('Windows build cleanup removes generated output only and can run twice', {skip:process.platform!=='win32'},()=>{
  const root=mkdtempSync(join(tmpdir(),'aabenbane-build-'));
  try {
    for(const name of ['.next/static/old-build','.open-next/assets','.data/releases','app']) {
      mkdirSync(join(root,name),{recursive:true});
      writeFileSync(join(root,name,'keep.txt'),'test');
    }
    writeFileSync(join(root,'.dev.vars'),'test-only');
    for(let i=0;i<2;i++) {
      const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',resolve('scripts/clean-build.ps1'),'-ProjectRoot',root],{encoding:'utf8',windowsHide:true});
      assert.equal(result.status,0,result.stderr||result.error?.message);
      assert.equal(existsSync(join(root,'.next')),false);
      assert.equal(existsSync(join(root,'.open-next')),false);
      for(const name of ['.data/releases/keep.txt','app/keep.txt','.dev.vars'])assert.ok(existsSync(join(root,name)),name);
    }
  } finally {rmSync(root,{recursive:true,force:true});}
});
