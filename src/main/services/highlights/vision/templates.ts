/**
 * Pictures the analysis knows by shape.
 *
 * Each one is a greyscale patch cut from a real recording at a reference frame
 * height of 1440, stored as base64 so it needs no image decoder and no file on
 * disk beside the bundle. They are matched by normalised cross-correlation (see
 * `match.ts`), so only the shape counts and not how bright the scene behind it
 * happened to be.
 *
 * Cut from Battlefield 6 footage at 3440x1440, from frames whose content was
 * confirmed by eye first. `scripts/visual-kills.mjs` is the bench that
 * established them and the thresholds that go with them.
 */

export interface Template {
  width: number;
  height: number;
  /** Row-major grey values, 0-255. */
  data: Uint8Array;
}

function decode(width: number, height: number, parts: string[]): Template {
  return { width, height, data: new Uint8Array(Buffer.from(parts.join(''), 'base64')) };
}

/**
 * The skull heading Battlefield 6's own kill confirmation, under the crosshair.
 *
 * Averaged over three confirmed kills, so no single clip's background becomes
 * part of the shape.
 */
export const BF_SKULL = decode(64, 64, [
    'KSktKykoKi0yMzIuMTQyMzg2LiwtJyEmLSwrKywrKyorKiosMDU3NjIvLzAvMjc8PDk0MC4tLSwVExUTFRQQChwWHCw5OS8q',
    'JyUnKCotLS0yMysmKS0wNDY0LykoKisqKy0uLjE5PTYrKC40Njg7ODQwLysqKisyIBUVEhMTDwopHhwoLy0qJyEeIyorKSgo',
    'Ki0rJSMtNzk0MjEvLCsrJygvODcyMS8tKy0wNDc3NjEvLy8tKy0wNykVEQ8NCwoHMjIuKyQhJiglJSoyNC0rKywsLSgkKDAz',
    'MC4wMDAxLysnKTM2Mi0qLC8vMTI0NDIuKy0wLy8wMjovFAwNCgsLByowMjIvLzM0MjEyNDQyMjQyMDIyLSorLzIyMjU1MDE0',
    'Mi8uLi0qKzA0NDMxLS4xLy0wNDU2NjY6MhUMEA8PEg4kKDJBSEI6OTUwLy8xNjo3LysvMjAtLC40Pj43MCwtMDMyMC0rKy81',
    'OTg2LygqMTEvMjY5OTg3OTQXDRITExgTKC85Q0IyJSsyMTU5PEA+MSYkJigoKissMDw6LystLS4vLi0tMTY5ODc0MC0sLzMx',
    'MDM0NDQ1Njk6IRETExQaFzA2NzAtKykwNzk8PTc0LysoJCUmJScrLTAyMCwsLS8wMjAtLzY7OTYwLS40NTQzMzQ2NTIwNDg9',
    'Qi0TEA4QExMtNjw3OUNANjAvLSsqKCs0NTIxLy0uMzY3NjIvKystMjQzMjQ1MzEvKyYwPj43Njk7Ojc0Mzc9QkIwEQ4ODxAR',
    'KzQ9RkhBNCgmKSgrMTQ1OT0+OjY0Njo/PDYyLywtLzAxMjI0MzIxLy0qLTY1LzQ2NzY1MjQ4OzYxLRgTExEREzYtJzQ5LCcq',
    'LzEyNDw/OTQ3PTk0NDc6OjUwMC8vMDIyMTAvKzA0NjQxLisqJB8qMjIyMTEzMzEqKi4iFhUTExUvKh8bIiosLjI1Njg7OzYy',
    'NDY3NzY1NTIvLjAwMTIzMS4tLjAwMzY1MjAuKyQiKDExLy0vMjMvKiotKBcTExMXHBoaISkwMS8xMzQ3ODg5NjY7Pj02Liwr',
    'KyswMjQ1My8sKy8wMDAyNDQyMSwmKC4yMS4tLS4rKisvLy0VERMXGSEiJSYoLS4sLzM0Mi8xOT8+Pj46MiorLy8rLTAyNDIv',
    'Ky00NjYzMjI1NjQzMDE0NjMxMTEzMjQ2Nzc0GhMXGRksMCojIyssKSw2MjEvLjI7Pjo3NjIsKzM3MC8wMjY2MzAtMDI0NDQ0',
    'Njg5Nzc3OTg1MjAxLioqMTc3NB8VFxgWLC4nIScvLCQlKisuMy0lLTYyMjQ0LioyOzUwLS8yNzg3MzIyNDY2NjY2NzY2NjU1',
    'MzIzMjAsKiosKi8gExMWFSwvKCQqMjAqKiooKC8pIyctKisvMzAtNkNZUU1LTFBUVFFPU1VLRT0zODQzMjI0NjUzMCwqKyws',
    'LSo0JxIQFhcwNDAqLTY6Ozs4MSolJSQkJikpKy8yQWWLlqShnpudoKSkoZ+dmYh5UDo0MzY7OzkyKygoKS0uLy8xNy8WEBcZ',
    'LTQ4ODg7OTU1OTgxJisxIx4rJiUvTYGrzc7Y1tPOzM7S1NPR0c7Jv55lNTQ7QTswKystMDExMTEzNDkzHRIVFzE5QUA8ODAm',
    'JjE0MS42NyYeLDEyS468ycjJyc3OzMbFxszOzczMzM/Fp3A4NjYvKistLzIyMTIzNjY9OyUUFBY5Pz04NDQxLC4zNDA1Pjkt',
    'KS83aZrLz8nJ0b7L2NrV0dHX2tra2tjW0s3BeEc0LyosLy8rKiwxNDc7PzwrFBIVOz44MzM0Njk5ODcxNDguMTYwZaPJxsfL',
    '0Nvr9fb19vb3+Pj5+Pn5+Pb047+DQDEtLi4tKScoLTQ4Ojs5KxMSFTk6ODQ1Njk6NjM0MDAvKjA6VKjEw77E1eTy9ff39/f4',
    '+fn6+fn7+/z7/fjiw302MS8tLCooKCovMzU1NC4YEhUzMjEwMzg5NS8xMTExMjI2O5HNy8TD0un3//r5+ff4+Pn5+fn4+Pn5',
    '+vn49ujJUTAvLy8vKickJSotLzEyIBISLi0vLzM5OS4qLzQzMjQ8Pk3C09HN1+r3+vr6+fn4+Pf39/f29ff3+Pn6+vf295gr',
    'Ki86OTcxKSYrLi82OSoTDi8zNjQ0ODYtKCstMjEvNjl3zszQ3O/29/f49/b29vb19fX19fb3+Pj5+fn5+PvvYScpLTY5NCoq',
    'NDU2OzwvEwwyNzYwLTAzMiwoJy0tKihKs8XL1Oz89vL39/f29vb19fX29/f4+fn5+fn4+fn7/LY7KB8eHRwbJTE4ODk3LhcN',
    'Ljs2LywtMjMuLCwuLCovks7Uy+f3/Pn3+Pj39fb19fX29vb29/j5+Pn39vb5/P3eXDgsKCQlKiwwMTQxMC8YDiEpLzAvLzIt',
    'LDM1NC4xQ6/VzMj0+vn3+Pr49/b29vX29fX19fX29/f39/b29/r8+Y8+LTQ0MjIyMiwlIyUlFxEjJCgxLCYsLiwvMjExOVG3',
    'ycbX+fn39/j39/f29vb19fX19fX19fb39vf39/X5/Pu2SikqLC0xNDo7MiUfIhoVKSQmNDQoKjIzMC8uMzlGssfF8fr39vf4',
    '9/b29fX19fX19fX19fX19/f29vb19vn7sFI9MTIzNDU0MjEzNDEgFykkISgzMy80Ozo1LjArNrPSy/n49fX39/b19fX19fX1',
    '9fX19fX19fb39fX18/X4+pNcTEBEPzk0LigpLzY8MBwoLSMaJCosNDw4NSMnKCygztX49vP19/f19PX19fX19fX19fX19fX3',
    '9/b09PL09/h5W0ovNDcyMTIyKykvPDcjKjk0LCopLzY0MS8eJzYxjcXZ9/Lz9vf29fT19fb29vb19fX19fX29/f29fPx8/b0',
    'bVlKIyEuLS80NjQ0NzcpICg0NjgzLjYzKzIvKC41MXbHy/Dy8/X39/b29fb29/f29vb29vb29/f39fXz7+/17mlYTCUhMS4v',
    'NTk8Ozs+MiAhJSgtKyQlIyg6NTEoLjFZzLzs8vH09ff39vb29/f39/f39/f39/f39vXz8u3m9NZlWk0lHyImMjU5Ojs8PTYm',
    'JSgmKC8lGSEyOTUsIjI4P8ey5fTy8/b39fb19/f39/f39/f39/f39/b29PPtw/PJYVpMJSEnKjM1OTMmJSYjKC84LyYtLCYw',
    'OC4oLzE/Oi27t9708/b29vP19vf39/f4+Pj4+Pj49/j4+vTy7aDrt1pbSSslHyEzNjgyIh8lJSYxOTYqISQsLyooITE7LyYg',
    'p4/Y9/XZ1uHk8PT39/f39/j49/f39PHt49Xz8euS1ahZXUU3NSwsOTgxOj84LiYkMzA0MSktMSgjKiQmLR4bHH1Tz/TFjoGP',
    'lp2z4vf39/f29/f30bCflI6Rve/ulKmYWFxCNDMwMDY4NTk4MzItIygzNC4yPDgsKi4qICQjJihRTs7wmF5aWFVVXqj19/n3',
    '9/T26o5oWVtcYHPq8KR8elVYKyYnJSk1OzcmKThELhoYLS4jJjEzLy8zLiQiKjQyK37J7IxfWVdSU1hx5fX3+ff19cFXWlpa',
    'WFpc4u/GdltRVCMoMC8zODkuHTE4KhoVGh8gHRwjMC8rLy0qISw2LU2sytyWWFNIPj1XWdf19ff39fSUW1paWldXTs7i66FX',
    'SlAxMDY2MyojHDs0IxwhJToxJyYrLSspKCstIBwlLD+TusbOoVtOJSUrK0yr0/L49fLyrVhTRTcwMTa9xdvoiz89LS0yMjEv',
    'JhseHiAgGx0zNjQvKyonIyMjMSweGiB1y8HLzMuch047NUWRt73p9fHv8eiWWUNCT2uCyMrd9885MCsmJSUrKyESDhUeHxoa',
    'LTg5LygpKikoKCgvLSwnnMbGzNnx8tSbjIOUwMa/za/U8fHx7KOGi6K3xczN3fftSjAqJSMlKikeEBIUFBwvKi42NionLTEv',
    'LjAmISk3N4jDzdDr8/Lzx77AwcjIxqV3f+Ty8/TnysPHvLnCyd/362M+KyYjISEeFxIUGx4fHx4xNC4mKDE0LyopJiMqMjda',
    'ss3f9ff19MvCysvKxr+NYF+h7PL17tzQzdHOz9rs9bRhUDEqIx4aFxUTFBYXGRUVMS8oIygxNjMtJyYsNjIvNHTF8fj79/nv',
    '6ePc08jGaV1cetrz9vbt4NbW2+Ls9dR2XV5MODM3MR4VFRoaFRIUFTIvKigpLDI2NTExNDMvLS8+ovX29/T58fPz9PDt5KOF',
    'jZi37Pj49/X08vPv8diLW1peTjk4RT8jFRUVFxMMCwszMTEzLiwvNjo3NjQvLCwxMVy10dDN1Pn6+ff1+ffu1tDMz9ju+Pny',
    '2tbT0MGTX1xfV0I5ODg0KBwXFxIPDw4SMzI2ODYzMjg8PDgzKCgrMTMxW3mFhYW99Pb39fb39/PVy9LX6/f45I+Fg4WBbV9h',
    'WkIkIyMlKCYZDhAPDAwWKjQzMzQ2NTIzNjg0MS0sLjAxNC1CWGFhf/b69vf3+Pny0tDY4e72+NNgW1xZXF9fX00xKSMmMjwy',
    'Gw4NDg8ZLzE1MzEvLy8tLS0vMDExMC8vMDImMURTV1jd8vb39/f49uzg4+319e+XXFxcXl5eV1VKNTItLC0yLBoMDRUjMjMk',
    'LzIzMTAuLy8sKiwvMTEwLy8sLC4xO0E/ltbz9PX39/f39vb19fzidFxYTkdFQjw5NzMzNDMqJSIZDxksNi4fGSwxNjk2NDQ2',
    'LSUlKi4rJyYpLTAtLC8xMlSkzer1+Pf49/b27+jYqF9cUzYwMDEzMzMzNDQzMSogGhkoLCceGRkuLjE0MS8vMSwiICcqJRwb',
    'Iy8vLC4wMjE0WnqfrdHv8vPixamflHdcX1AqKCkuMzM0NTQ0MzQxKiUnKSUeGxoaLyopKygmKCwsJSMnLCojISQoKi4yLy0w',
    'LzE0W2CHnKGjmHxbVVpcWlxLLS8xMTIyMjMzMzMxLy8vLCYlIBwbFjIvLS4uLCosLSonKCwyNS8mISYqKigoMTEuL09UWF1d',
    'W1xcWl5cW1hWPjQ2My8vLzEvLzEwLSstLy0gHh0bFAk0NDIwMDAvLi0sKiktMzY2LyglJiYjKDM5LSwyPkxRVllbXl9eW1dH',
    'OzYuMTEtLC0tLTAxLSsoJiQZGxwbFAsOMTczMTMzMy8tLC0sMC8rLzc4My0tLy4qKCgqLC0vMztMW15aST84Ly8wMC8uLy0s',
    'LTEzLispJiMXFxsgFgcKIicvMTQ1MzEvMTg2LispJSgzOzkyMTc2KycoKCoqLC4uJiUnLDE2MykoLS0sLzAvLjEzMC0qJiIX',
    'FhYcFggLHi8wMzg8PDMuLi82NzAtLy8vLzEzMDA2ODYzMS8vLSstMTAnIyYtMS4gICgsLS4vMDMzLy0sJyIXFxQTDQYJHy0j',
    'PT0+Pz48NCkmKjAxMTU4ODIwMDA1ODYzMzM1NjQwMDU3Ly8xMTEuKSguMTExMzU0Ly0sKiMXGBgWCwAIHCghFw==',
]);

/**
 * The boxed word KILL from the label row under that banner.
 *
 * The skull alone is not enough. Battlefield draws skull-shaped icons for
 * assists as well, and any round icon — a clock for a sector, a helmet for a
 * spot — correlates with a skull well enough to matter. The word does not.
 */
export const BF_KILL_LABEL = decode(72, 44, [
    'HhkTEBIUFBYaHRwdICEfHx8gHx8fHx8eHh4fHxwZGBwhIRsYGRodHx4dHR4eGB8fHh0eHh4dGxoaGRkaGxkYGBcYFhAKCQkK',
    'GhUQDxIWGRoaGhwgIyIhHx8eHR0eHh4dHR4fICIkJCMhHRoYGR0fHx4eHRwbGBobGxscHh8eHh0cGxsbGhoZGBcVFRMKCQkJ',
    'FRMRExcaHBwbGxwgIiMhHx0cGhodHx8eHh8fISIjIyIgHhwbHBwdHh8eGxoZGRkZGRoaGhoaGRkZGRkaGhkYGBgWFRQKCQgJ',
    'ERIVGBobHh0cGxwfISIhHx0bGRoeIB8fHx8gISIiISAgICAhHx0cHB4eGhgZHR4dGhkZGRkZGRoaGhoaGhoaGhkYFxcKCAgJ',
    'EhQZHhyPmZSRkJKVmJmYlpSQjY2QkpKRkZKTlZSTkI+Qk5mal5aUk5KRkZGRkpKTk5OSkZGRkZKTlJSUk5OSkpGUkZk1BggJ',
    'FRgcHx+WiYWFhYWGhoaGhoSDgoGAgICAgIGBgYB+fHx+goeJh4aFhISEhISEhYaHiIiIh4aGhoaHh4eGhoWEg4KEg5g1BggI',
    'GhwdHh+Oix4gISAeHR0eHh4eHx8fHx8gISEhICAgHx8gISIhHhwcGxsbGxwcHBwcGxsbHBwcHBwbGRkYGRobGhkdMqE1BggI',
    'HB4eHh+RjR0fISAfHyAiIiIhISIkJSYnKCgoJyYlJygoKCYjHx0dHBwdHR0dHR0dHBwcHB0eHh0cGhgXGRsbHBwaLZU1BggI',
    'HR4eHiCUjB8iIyMiIiMmJiUiISMmKCkqKisrKigoKy0sKickIiEgICEhISEiISEhIB8fHx8gICAfHRoaGhsaGhkaL581BggI',
    'HB4eHR6UiB8jICEhJCYnKScpLSsqKistLi0rLS4wLC0uLSssKyUoJiUlJiUlJSUmLCEiIyMiIiEgHRsaGhwcGhkaL543DwgJ',
    'HB0eHR+ShB8hHyIiJigqLCstLy8uLi4xMjIuLzE1MDEyMC4uLScqKCcmJycnJykpLyUlJiYkIyIhHxwaGxwbGRkaMJ44EAgI',
    'HB4eHSKTgyAfHiIjJyotMC8wMTMzMzM1NjYzMzY7NTY3NDIxLiosKSgoKSkqKissMSgoKScmJSQiIB0bGxsbGRkaMZ04EQgI',
    'HB4eHSCUgyAeHCMjKS0wMT1ANjc2NTc4QkpFPURLQz47OjtDQTAtKykpKissLS4uQjgtKyknJiUjIR4cGxsbGRkaMZ05EggH',
    'HR4eHR2UgiAcGyQnLTAxOHqMUDs4OT1EZIGAVEmEjFc/PkOAf1IyLCopLC0uLzA2dXVHLyspKCYkIR8cGhoaGRkaMZ04EgkH',
    'HR4dHSCUgiAaGiYrLzE2RZegXD48PkNZiJmEVEqerWBBQUaUols1LSsqLS8wMjRAmJ1gNy0rKSclIh8cGhoaGBkaMZ04EwkG',
    'HR4dHCOUgyAZGigrMDM7SZicWT8/Q0hxm5VcSE6bp1xCREiVoVs4MCwrLzEyNDdAmp1bNy4rKigmIyAdGhoaGBkaMZ03FAoG',
    'Hh0cGyCUhB8XGiosMjQ7RpmdVkFDRU6Bnn5MSU2VoVtDRUmWn1o6Mi0sMTQ1Nzo+l51WNS4sKyonJCAdGhoaGBkaMZ03FQsG',
    'Hh0bGhuUhhwWGistMzU+SJ2fWENFSHGemWBFSE+ZpF5FREyYn1s8NC8tMzY2NjxDmZ5ZOjAtLCspJSEeGxoaGRkaMZ02Fg0G',
    'Hx0aGRmUhxoWGywuNDdASJ6gWUVISommfE1ESFCaomBGRU6ZnVs9NTEuNTk4Nz5EmZ1ZPTIvLi0qJiIfHBsbGRkaMZ02Fw4G',
    'Hx0aGRiTiBsWGy0uNDlBSZ6gXEVLdJyZZUlESFGbomFHRk+bnFs/NzIwNzo5Nz9Gmp1aPzQxMC8sKCQgHRwcGhoaMZ02FxAH',
    'IB0aGReTiRwYGi4vNDpCSZyfX0hNiZ54U0hFSVKZoGFJSFGbm1xAODUyODs6OEFHm51aQDYzMjEuKiUhHh4dGxoaMZw2GBII',
    'IB4bGhiSiB0ZGS4vNTpDSZueiY6bnJVnTkhGSlOYn2JKSVOcm11BOTc0Ojw7OUFIm51bQjg1NDMwKyYjHx8eGxsaMZw3GBUJ',
    'IR4cGxqRiB0aFy4vNDpDSpednKqqnpJnTUhHSlOXnmJKSlOcm15BOzg2Ozw8OkJJm51bQzk3NTQxLSgkISAfHBsaMZw3GBcK',
    'IR8dHByQiBwaFy4vMzpCSpaddGV4mJptT0hISlOWm2NKS1Scml5BOzo4Oz08O0JJmp1cRDo4NzYzLiklIiEgHRsaMpw3GBgL',
    'IR8dHR2RiBsaGC0tMjlBSpSeZVJYd5mLWElJSVKXm2NJSlOcmWBBPTs5PT09PUNKmZ5dRDw5ODc0LiomIyIhHRsaMpwzGBgM',
    'IB8eHx2RhxsaGisqMDVASpSeXkhNYZebdE5HSFGYnWJISFKcmV48Ozs8PD0+PkNLmJ9jRj47OTg2LCsnJCIhHRoaM5w0FxgO',
    'Hx8eHxyRhxobGykoLzM/SpSeWkVGUHKYmV9KR0+ZnGJIR1GcmWhBQUFBQUA/QENMlZ9mR0E+PDo4Mi0oJSIhHhoaNJw1FhgQ',
    'Hx8fHhuRhhobGygoLzE9SpWeWENBR1Gal31NS06ZnGFHRlGcnXVQUFFRUlJRSUJNlKBnSk5PTk5NTTInJSIhHhobNJw2FhgS',
    'Hh8eHRuRhhobGycnLzA8SpefVkE7QUh+m5VgTU2YnGBGRFGcmpiRj46Oj4+TV0FMk6OUjo2LiYiGhUwvJiIhHhobNZw3FRgT',
    'HB4eHBuRhRobGyUmLi45SpmjVT82OkBXfp6TUUuZn19AQFCdnJycnZ2dnp6nVz9JlKScnJ6cmpmXkkwqJiIhHhobNZw3FRcV',
    'Gx4fHRuRhRkbGyMmLSwzPnd7Sj40NjpAWX52UUV3d1M+PT97enp5eXh4eXl8Uj1CcH93fHt7eXd1ckkzJiIhHhobNZ03FRYW',
    'Gh4fHRyRhBkbGyElKikwLDg4Mzc1MzY5Pjw7Ozw/OUE9OzdCRkZGRUVEQkE+Oz4/SUlAQD8+PTw7NjIsJiIhHRoaNZ43FRYY',
    'Gx8fHRyRhBgbGyAkKCYrKzMyLi8vMDM1NDkwMTM2Lzk2NTI4ODk5OTk4ODg3NjY0ODozNTY2Nzc2LiwpJSIhHRsaNaE3FRUZ',
    'Gh8fGx2PhBgbGx8jJSUoLCwtLCssLTAxMTAvLy8vLy8vMDAxMTIyMjIyMzIyMjIyMjIyMTEwLy4tKykmJCEfHBsbNqg2FRYa',
    'Gh4dGRyPhBkcGx8jJCQlJygoKSoqLC0tLSwrKywsLCwsLC0uLy8vLy8vLy8vLi4uLy4uLi0tLCsqKSYkIyMiHxwXNpw2Fhca',
    'Gh0cGByPhBocHB4hICEiIiMkJCYpKSkpKCcnJykqKSkpKSorLCwsLCwsLS0tLS0tLS0tLCwrKikoJiQhHh0dHR4aNaA2Fxga',
    'Gh0cGByPgxscGxscHBwcHR0eHyEjIyMiIiEhIiIjIyIiIiMjIyMjIyMjIyQkJCQlJSQkIyMiISEgHx0dHBsaGxsbMJ42Fxga',
    'GRwbGByPghscGxobGhobGxscHR0dHR0dHR0eHyAgICAfHx8fHh0dHR0dHR0dHR0eHh4dHRwcHB0dHBsaGhobGxsbN6E2Fxga',
    'GRwbGB2SgxscGxkbHBwcHBwcHR0dHR0eHyAgISEgICAgICAfHx8eHh4eHh4eHh4eHh4fHx8fHx4dHR0cHBsYGR4ZOp03GBga',
    'GRsbGRyYlJaYmJCUlpaWlZSUlZaXlpaWl5eXl5aVlZaXmJiYmJeXl5eXl5eWlpaWlpaWlpWVlZWVlpeXl5aVlJWbnJs3GBgZ',
    'GhobGh6GjIGEgX+CgoKBgH5+f4GBgYB/f359fX19f4CBgoKCgoKCgYGBgIB/fn19fX19fHx8fH19fn5/f4CAf35+gX04GBgZ',
    'GhobHR8fHRsaGRkZGRobGhgZHB8gHx8fHx8fHx8fHh4eHh4eHx8fHx8fHx4eHR0eHh8gHxwYHB4XFR0fGBYbHxwXGBwbGRcY',
    'GhobHh8fHRsZGhoaGhscGxgZHB8fHx8fHx8fHx8fHh4fHx8fHx8fHx8fHx4eHR0eHh8gHx0ZHB0XFx4fGBgcHhsZGhwaGBcY',
    'GxkbHh8fHhwaGhsaGhsbGxkZHB8fHh4fHx8fHx8fHh4eHh8fHx8fHx8fHx4eHR0eHh8gHx0aHB0XGSAeGBodGxocHBsaGBcY',
]);
