import {test,expect} from '@playwright/test';

test('UKPD production build opens to a usable login screen',async({page})=>{
  await page.goto('/');
  await expect(page).toHaveTitle(/UK Principal Designers/i);
  await expect(page.getByRole('heading',{name:'Project Management Portal'})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Email'})).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button',{name:'Sign in'})).toBeEnabled();
  await expect(page.getByLabel('Password')).toHaveAttribute('type','password');
});

test('email and password are required; empty form cannot submit',async({page})=>{
  await page.goto('/');
  const email=page.getByRole('textbox',{name:'Email'});
  const password=page.getByLabel('Password');
  await expect.poll(()=>email.evaluate(el=>el.required)).toBe(true);
  await expect.poll(()=>password.evaluate(el=>el.required)).toBe(true);
  await page.getByRole('button',{name:'Sign in'}).click();
  // Native required inputs prevent an empty login request being submitted.
  expect(await email.evaluate(el=>el.validity.valueMissing)).toBe(true);
  await email.fill('test@example.invalid');
  expect(await password.evaluate(el=>el.validity.valueMissing)).toBe(true);
});

test('login is reachable on a phone-sized viewport',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const signIn=page.getByRole('button',{name:'Sign in'});
  await expect(signIn).toBeVisible();
  const bounds=await signIn.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds.x+bounds.width).toBeLessThanOrEqual(390);
});

// Step 3, automatic take-off accuracy and IFC4 export require an authenticated
// seeded test project, real calibration evidence and known expected drawings.
// Do not pretend the public login smoke test verifies those private workflows.
