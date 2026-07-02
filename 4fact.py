a=int(input("Enter a number: "))
fact=1
if a<0:
    print("Factorial does not exist for negative numbers")
else:
    for i in range(1,a+1):
        fact=fact*i
    print("Factorial of",a,"is",fact)
