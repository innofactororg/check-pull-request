/**
 * The MIT License (MIT)
 *
 * Copyright (c) 2018 GitHub, Inc. and contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 * https://github.com/actions/checkout/blob/main/__test__/git-version.test.ts
 */
import {GitVersion} from '../lib/git-version'

describe('git-version tests', () => {
  it('basics', async () => {
    let version = new GitVersion('')
    expect(version.isValid()).toBeFalsy()

    version = new GitVersion('asdf')
    expect(version.isValid()).toBeFalsy()

    version = new GitVersion('1.2')
    expect(version.isValid()).toBeTruthy()
    expect(version.toString()).toBe('1.2')

    version = new GitVersion('1.2.3')
    expect(version.isValid()).toBeTruthy()
    expect(version.toString()).toBe('1.2.3')
  })

  it('check minimum', async () => {
    let version = new GitVersion('4.5')
    expect(version.checkMinimum(new GitVersion('3.6'))).toBeTruthy()
    expect(version.checkMinimum(new GitVersion('3.6.7'))).toBeTruthy()
    expect(version.checkMinimum(new GitVersion('4.4'))).toBeTruthy()
    expect(version.checkMinimum(new GitVersion('4.5'))).toBeTruthy()
    expect(version.checkMinimum(new GitVersion('4.5.0'))).toBeTruthy()
    expect(version.checkMinimum(new GitVersion('4.6'))).toBeFalsy()
    expect(version.checkMinimum(new GitVersion('4.6.0'))).toBeFalsy()
    expect(version.checkMinimum(new GitVersion('5.1'))).toBeFalsy()
    expect(version.checkMinimum(new GitVersion('5.1.2'))).toBeFalsy()

    version = new GitVersion('4.5.6')
    expect(version.checkMinimum(new GitVersion('3.6'))).toBeTruthy()
    expect(version.checkMinimum(new GitVersion('3.6.7'))).toBeTruthy()
    expect(version.checkMinimum(new GitVersion('4.4'))).toBeTruthy()
    expect(version.checkMinimum(new GitVersion('4.5'))).toBeTruthy()
    expect(version.checkMinimum(new GitVersion('4.5.5'))).toBeTruthy()
    expect(version.checkMinimum(new GitVersion('4.5.6'))).toBeTruthy()
    expect(version.checkMinimum(new GitVersion('4.5.7'))).toBeFalsy()
    expect(version.checkMinimum(new GitVersion('4.6'))).toBeFalsy()
    expect(version.checkMinimum(new GitVersion('4.6.0'))).toBeFalsy()
    expect(version.checkMinimum(new GitVersion('5.1'))).toBeFalsy()
    expect(version.checkMinimum(new GitVersion('5.1.2'))).toBeFalsy()
  })
})
