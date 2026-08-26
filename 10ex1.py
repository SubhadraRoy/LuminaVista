x = int(input("Enter the value of x: "))
n = int(input("Enter the value of n: "))

s = 0

for i in range(1, n + 1):
    term = x ** i
    s = s + term

print("Sum of the series =", s)