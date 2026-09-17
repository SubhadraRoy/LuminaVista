n = int(input("Enter a positive integer: "))

if n <= 0:
    print("Please enter a positive integer")
else:
    s = 0
    fact = 1
    i = 1
    while i <= n:
        fact = fact * i
        s = s + fact
        i = i + 1
    print(str(n) + " sum of factorials = " + str(s))

